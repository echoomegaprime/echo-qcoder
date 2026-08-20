#!/usr/bin/env bash
set -Eeuo pipefail

container=${OLLAMA_CONTAINER:-echo-ollama-qwen27b}
source_model=${QCODER_SOURCE_MODEL:-huihui_ai/Qwen3.6-abliterated:27b}
source_digest=${QCODER_SOURCE_DIGEST:-418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507}
target_model=${QCODER_MODEL:-c3po-code:echo-abliterated-128k}
context_length=${QCODER_CONTEXT_LENGTH:-131072}

if [[ ! "$container" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  printf 'invalid Ollama container name\n' >&2
  exit 20
fi
if [[ ! "$source_model" =~ ^[A-Za-z0-9_.:/-]+$ || ! "$target_model" =~ ^[A-Za-z0-9_.:/-]+$ ]]; then
  printf 'invalid Ollama model name\n' >&2
  exit 21
fi
if [[ "$context_length" != 131072 ]]; then
  printf 'QCODER_CONTEXT_LENGTH must be exactly 131072\n' >&2
  exit 22
fi

api_model_digest() {
  python3 - "$1" <<'PY'
import json
import sys
import urllib.request

with urllib.request.urlopen("http://127.0.0.1:11436/api/tags", timeout=10) as response:
    payload = json.load(response)
model = sys.argv[1]
print(next((item.get("digest", "") for item in payload.get("models", []) if item.get("name") == model), ""))
PY
}

actual_source_digest=$(api_model_digest "$source_model")
if [[ "$actual_source_digest" != "$source_digest" ]]; then
  printf 'QCoder source digest mismatch for %s\n' "$source_model" >&2
  exit 24
fi

workdir=$(mktemp -d -t qcoder-model.XXXXXXXX)
modelfile="$workdir/Modelfile"
container_modelfile="/tmp/qcoder-model-${RANDOM}-${RANDOM}.Modelfile"
cleanup() {
  docker exec "$container" rm -f -- "$container_modelfile" >/dev/null 2>&1 || true
  rm -f -- "$modelfile"
  rmdir -- "$workdir" 2>/dev/null || true
}
trap cleanup EXIT

docker exec "$container" ollama show --modelfile "$source_model" >"$modelfile"
if grep -qE '^PARAMETER[[:space:]]+num_ctx[[:space:]]+' "$modelfile"; then
  sed -E -i "s/^PARAMETER[[:space:]]+num_ctx[[:space:]]+.*/PARAMETER num_ctx $context_length/" "$modelfile"
else
  printf '\nPARAMETER num_ctx %s\n' "$context_length" >>"$modelfile"
fi

grep -qE "^PARAMETER[[:space:]]+num_ctx[[:space:]]+$context_length$" "$modelfile"
docker cp "$modelfile" "$container:$container_modelfile" >/dev/null
docker exec "$container" ollama create "$target_model" -f "$container_modelfile"

actual_context=$(
  docker exec "$container" ollama show --parameters "$target_model" |
    awk '$1 == "num_ctx" {print $2; exit}'
)
if [[ "$actual_context" != "$context_length" ]]; then
  printf 'QCoder model context mismatch: expected %s, found %s\n' "$context_length" "$actual_context" >&2
  exit 23
fi

actual_parent=$(python3 - "$target_model" <<'PY'
import json
import sys
import urllib.request

body = json.dumps({"model": sys.argv[1]}).encode()
request = urllib.request.Request(
    "http://127.0.0.1:11436/api/show",
    data=body,
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=30) as response:
    payload = json.load(response)
print(payload.get("details", {}).get("parent_model", ""))
PY
)
if [[ -n "$actual_parent" && "$actual_parent" != "$source_model" ]]; then
  printf 'QCoder target parent mismatch\n' >&2
  exit 25
fi

target_digest=$(api_model_digest "$target_model")
if [[ ! "$target_digest" =~ ^[0-9a-f]{64}$ ]]; then
  printf 'QCoder target digest missing or invalid\n' >&2
  exit 26
fi

printf 'QCODER_MODEL_READY source=%s source_digest=%s target=%s target_digest=%s context=%s\n' \
  "$source_model" "$source_digest" "$target_model" "$target_digest" "$actual_context"
