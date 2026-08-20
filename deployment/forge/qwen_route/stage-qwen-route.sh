#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf 'stage-qwen-route.sh must run as root\n' >&2
  exit 20
fi
source_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(git -C "$source_root" rev-parse --show-toplevel)
commit=$(git -C "$repo_root" rev-parse HEAD)
if ! git -C "$repo_root" diff --quiet || ! git -C "$repo_root" diff --cached --quiet; then
  printf 'refusing staging from a dirty tracked checkout\n' >&2
  exit 21
fi
alias_digest=$(python3 - <<'PY'
import json
import urllib.request
with urllib.request.urlopen("http://127.0.0.1:11436/api/tags", timeout=10) as response:
    payload=json.load(response)
print(next((item.get("digest", "") for item in payload.get("models", []) if item.get("name") == "c3po-code:echo-abliterated-128k"), ""))
PY
)
if [[ ! "$alias_digest" =~ ^[0-9a-f]{64}$ ]]; then
  printf 'stable alias digest missing\n' >&2
  exit 22
fi

unit=echo-qwen-route-stage
systemctl stop "$unit.service" 2>/dev/null || true
systemctl reset-failed "$unit.service" 2>/dev/null || true
systemd-run \
  --unit="$unit" \
  --uid=forge \
  --gid=forge \
  --working-directory="$source_root" \
  --property=Restart=on-failure \
  --property=RestartSec=3s \
  --setenv=QWEN_UPSTREAM=http://127.0.0.1:11436 \
  --setenv=QWEN_MODEL_ALIAS=c3po-code:echo-abliterated-128k \
  --setenv=QWEN_BASE_MODEL=huihui_ai/Qwen3.6-abliterated:27b \
  --setenv=QWEN_BASE_DIGEST=418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507 \
  --setenv=QWEN_ALIAS_DIGEST="$alias_digest" \
  --setenv=QWEN_CONTEXT_LENGTH=131072 \
  --setenv=QWEN_MODEL_BYTES=23152946049 \
  --setenv=QWEN_GPU_COUNT=2 \
  --setenv=QWEN_OLLAMA_CONTAINER=echo-ollama-qwen27b \
  --setenv=QWEN_MAX_QUEUE_DEPTH=1 \
  /usr/bin/python3 -m uvicorn app:app --host 127.0.0.1 --port 18437 --workers 1 --no-access-log >/dev/null

for _ in $(seq 1 60); do
  if python3 - <<'PY'
import json
import urllib.request
with urllib.request.urlopen("http://127.0.0.1:18437/health", timeout=5) as response:
    payload=json.load(response)
if response.status != 200 or payload.get("ok") is not True:
    raise SystemExit(1)
PY
  then
    break
  fi
  sleep 2
done
python3 "$source_root/verify-qwen-route.py" \
  --base http://127.0.0.1:18437 \
  --report "$source_root/stage-quick-$commit.json" >/dev/null
printf 'QWEN_ROUTE_STAGE_GREEN commit=%s port=18437 alias_digest=%s report=%s\n' \
  "$commit" "$alias_digest" "$source_root/stage-quick-$commit.json"
