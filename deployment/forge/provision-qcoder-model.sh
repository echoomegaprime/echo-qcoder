#!/usr/bin/env bash
set -Eeuo pipefail

container=${OLLAMA_CONTAINER:-echo-ollama}
source_model=${QCODER_SOURCE_MODEL:-c3po-code:latest}
target_model=${QCODER_MODEL:-c3po-code:qcoder-32k}
context_length=${QCODER_CONTEXT_LENGTH:-32768}

if [[ ! "$container" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  printf 'invalid Ollama container name\n' >&2
  exit 20
fi
if [[ ! "$source_model" =~ ^[A-Za-z0-9_.:/-]+$ || ! "$target_model" =~ ^[A-Za-z0-9_.:/-]+$ ]]; then
  printf 'invalid Ollama model name\n' >&2
  exit 21
fi
if [[ ! "$context_length" =~ ^[0-9]+$ ]] || ((context_length < 16384 || context_length > 65536)); then
  printf 'QCODER_CONTEXT_LENGTH must be between 16384 and 65536\n' >&2
  exit 22
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

printf 'QCODER_MODEL_READY source=%s target=%s context=%s\n' \
  "$source_model" "$target_model" "$actual_context"
