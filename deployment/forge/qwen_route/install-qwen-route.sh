#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf 'install-qwen-route.sh must run as root\n' >&2
  exit 20
fi

source_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(git -C "$source_root" rev-parse --show-toplevel)
commit=$(git -C "$repo_root" rev-parse HEAD)
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'invalid source commit\n' >&2
  exit 21
fi
if ! git -C "$repo_root" diff --quiet || ! git -C "$repo_root" diff --cached --quiet; then
  printf 'refusing deployment from a dirty tracked checkout\n' >&2
  exit 22
fi

service_root=/home/forge/services/qwen-route
release_dir=$service_root/releases/$commit
compose_dir=/home/forge/services/ollama-qwen-home
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=$service_root/backups/$timestamp
volume=ollama_ollama_data
base_digest=418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507
alias=c3po-code:echo-abliterated-128k

if ! docker volume inspect "$volume" >/dev/null; then
  printf 'required persistent model volume is missing: %s\n' "$volume" >&2
  exit 23
fi

install -d -o forge -g forge "$release_dir" "$backup_dir" "$compose_dir" /etc/echo
install -m 0644 "$source_root/app.py" "$release_dir/app.py"
install -m 0755 "$source_root/qwen-warmup.py" "$release_dir/qwen-warmup.py"
install -m 0755 "$source_root/qwen-home-supervisor.sh" "$release_dir/qwen-home-supervisor.sh"
install -m 0644 "$source_root/register.sql" "$release_dir/register.sql"
chown -R forge:forge "$release_dir"

backup_path() {
  local path=$1
  local name=$2
  if [[ -e "$path" || -L "$path" ]]; then
    cp -a "$path" "$backup_dir/$name"
  else
    : >"$backup_dir/$name.absent"
  fi
}

backup_path "$compose_dir/docker-compose.yml" docker-compose.yml
backup_path /etc/systemd/system/echo-qwen-home.service echo-qwen-home.service
backup_path /etc/systemd/system/echo-qwen-home.service.d/90-qwen-runtime.conf 90-qwen-runtime.conf
backup_path /etc/systemd/system/echo-qwen-route.service echo-qwen-route.service
backup_path /etc/echo/qwen-route.env qwen-route.env
systemctl show echo-qwen-home.service -p FragmentPath -p DropInPaths -p Type -p RemainAfterExit -p Restart -p ActiveState -p SubState >"$backup_dir/systemd-before.txt" || true
docker inspect echo-ollama-qwen27b >"$backup_dir/container-before.json" 2>/dev/null || true
docker volume inspect "$volume" >"$backup_dir/volume-before.json"

install -m 0644 "$source_root/docker-compose.yml" "$compose_dir/docker-compose.yml"
install -m 0644 "$source_root/echo-qwen-home.service" /etc/systemd/system/echo-qwen-home.service
install -d /etc/systemd/system/echo-qwen-home.service.d
install -m 0644 "$source_root/echo-qwen-home-runtime.conf" /etc/systemd/system/echo-qwen-home.service.d/90-qwen-runtime.conf
install -m 0644 "$source_root/echo-qwen-route.service" /etc/systemd/system/echo-qwen-route.service

ln -sfn "$release_dir" "$service_root/current.next"
mv -Tf "$service_root/current.next" "$service_root/current"

docker compose -f "$compose_dir/docker-compose.yml" config --quiet
systemctl daemon-reload
systemctl enable echo-qwen-home.service >/dev/null
systemctl restart echo-qwen-home.service

for _ in $(seq 1 120); do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' echo-ollama-qwen27b 2>/dev/null || true)
  if [[ "$health" == healthy ]]; then
    break
  fi
  sleep 2
done
if [[ ${health:-missing} != healthy ]]; then
  printf 'Qwen container did not become healthy\n' >&2
  exit 24
fi

OLLAMA_CONTAINER=echo-ollama-qwen27b \
QCODER_SOURCE_MODEL=huihui_ai/Qwen3.6-abliterated:27b \
QCODER_SOURCE_DIGEST=$base_digest \
QCODER_MODEL=$alias \
QCODER_CONTEXT_LENGTH=131072 \
  /usr/bin/bash "$repo_root/deployment/forge/provision-qcoder-model.sh"

alias_digest=$(python3 - "$alias" <<'PY'
import json
import sys
import urllib.request

with urllib.request.urlopen("http://127.0.0.1:11436/api/tags", timeout=10) as response:
    payload = json.load(response)
value = next((item.get("digest", "") for item in payload.get("models", []) if item.get("name") == sys.argv[1]), "")
print(value)
PY
)
if [[ ! "$alias_digest" =~ ^[0-9a-f]{64}$ ]]; then
  printf 'stable alias digest missing after provisioning\n' >&2
  exit 25
fi

cat >"$backup_dir/qwen-route.env.new" <<EOF
QWEN_UPSTREAM=http://127.0.0.1:11436
QWEN_MODEL_ALIAS=$alias
QWEN_BASE_MODEL=huihui_ai/Qwen3.6-abliterated:27b
QWEN_BASE_DIGEST=$base_digest
QWEN_ALIAS_DIGEST=$alias_digest
QWEN_RELEASE_SHA=$commit
QWEN_CONTEXT_LENGTH=131072
QWEN_MODEL_BYTES=23152925077
QWEN_GPU_COUNT=2
QWEN_OLLAMA_CONTAINER=echo-ollama-qwen27b
QWEN_MAX_QUEUE_DEPTH=1
QWEN_DEFAULT_OUTPUT_TOKENS=4096
QWEN_MAX_OUTPUT_TOKENS=8192
QWEN_WRAPPER_MARGIN_TOKENS=128
QWEN_TOOL_MARGIN_TOKENS=512
QWEN_NO_TOOL_MARGIN_TOKENS=128
QWEN_KEEP_ALIVE=24h
EOF
install -o root -g forge -m 0640 "$backup_dir/qwen-route.env.new" /etc/echo/qwen-route.env

sudo -u postgres psql -d echo -v alias_digest="$alias_digest" -f "$release_dir/register.sql" >/dev/null

systemctl enable echo-qwen-route.service >/dev/null
systemctl restart echo-qwen-route.service
for _ in $(seq 1 60); do
  if python3 - <<'PY'
import json
import urllib.request
with urllib.request.urlopen("http://127.0.0.1:11437/health", timeout=5) as response:
    payload=json.load(response)
if response.status != 200 or payload.get("ok") is not True:
    raise SystemExit(1)
PY
  then
    break
  fi
  sleep 2
done

python3 - <<'PY'
import json
import urllib.request
with urllib.request.urlopen("http://127.0.0.1:11437/health", timeout=10) as response:
    payload=json.load(response)
if response.status != 200 or payload.get("ok") is not True:
    raise SystemExit("governed route health failed")
PY

sudo -u postgres psql -d echo -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
UPDATE arcanum_sdk.sdk_capabilities
SET health_status='green', health_reason='exact live route verified', last_health_check_at=now(), updated_at=now()
WHERE id IN ('echo.qwen.local.health','echo.qwen.local.chat','echo.qwen.local.openai_chat','echo.qwen.local.token_budget');
UPDATE arcanum_sdk.llm_models
SET health_status='ok', last_seen_at=now(), last_ok_at=now(), last_error=NULL, consecutive_failures=0, updated_at=now()
WHERE provider='ollama-local-forge' AND model_id='c3po-code:echo-abliterated-128k';
SQL

compose_sha=$(sha256sum "$compose_dir/docker-compose.yml" | awk '{print $1}')
unit_sha=$(sha256sum /etc/systemd/system/echo-qwen-route.service | awk '{print $1}')
cat >"$service_root/deployment-receipt-$commit.json" <<EOF
{"service":"echo-qwen-route","commit":"$commit","base_digest":"$base_digest","alias":"$alias","alias_digest":"$alias_digest","context_length":131072,"volume":"$volume","image":"ollama/ollama@sha256:57f573b47f1f71ebb445789f279fe3e596a8beab182f7cf486db9205bad87c5a","compose_sha256":"$compose_sha","unit_sha256":"$unit_sha","backup_dir":"$backup_dir","deployed_at":"$timestamp"}
EOF
chown forge:forge "$service_root/deployment-receipt-$commit.json"
printf 'QWEN_ROUTE_DEPLOYED commit=%s alias_digest=%s context=131072 volume=%s backup=%s\n' "$commit" "$alias_digest" "$volume" "$backup_dir"
