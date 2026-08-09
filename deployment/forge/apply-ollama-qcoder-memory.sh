#!/usr/bin/env bash
set -Eeuo pipefail

compose_dir=/home/forge/services/ollama
compose_file="$compose_dir/docker-compose.yml"
backup_file="$compose_dir/docker-compose.yml.bak-qcoder-20260809T0905"
expected_sha=a6c2848bfeb2cc62a3c803ede9fab93779313a9a294cf6d66b872530896120ff
minimum_available_bytes=$((8 * 1024 * 1024 * 1024))
change_started=0

rollback() {
  if [[ "$change_started" == 1 && -f "$backup_file" ]]; then
    cp -p "$backup_file" "$compose_file"
    (cd "$compose_dir" && docker compose up -d --force-recreate ollama >/dev/null)
  fi
}
trap rollback ERR

current_sha=$(sha256sum "$compose_file" | awk '{print $1}')
if [[ "$current_sha" != "$expected_sha" ]]; then
  printf 'refusing update: expected %s, found %s\n' "$expected_sha" "$current_sha" >&2
  exit 20
fi

available_bytes=$(awk '/MemAvailable:/ {print $2 * 1024}' /proc/meminfo)
if (( available_bytes < minimum_available_bytes )); then
  printf 'refusing update: only %.2f GiB memory available\n' "$(awk -v b="$available_bytes" 'BEGIN {print b/1024/1024/1024}')" >&2
  exit 21
fi

cp -p "$compose_file" "$backup_file"
change_started=1
sed -i \
  -e 's/OLLAMA_KEEP_ALIVE=1m/OLLAMA_KEEP_ALIVE=30m/' \
  -e 's/memswap_limit: 12g/memswap_limit: 52g/' \
  -e 's/memory: 12g/memory: 48g/' \
  "$compose_file"

grep -q 'OLLAMA_KEEP_ALIVE=30m' "$compose_file"
grep -q 'memswap_limit: 52g' "$compose_file"
grep -q 'memory: 48g' "$compose_file"

cd "$compose_dir"
docker compose config --quiet
docker compose up -d --force-recreate ollama >/dev/null

container_id=$(docker compose ps -q ollama)
for _ in $(seq 1 30); do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
  if [[ "$health" == healthy ]]; then
    break
  fi
  if [[ "$health" == unhealthy || "$health" == exited || "$health" == dead ]]; then
    printf 'ollama entered terminal health state: %s\n' "$health" >&2
    exit 22
  fi
  sleep 2
done

health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
if [[ "$health" != healthy ]]; then
  printf 'ollama did not become healthy: %s\n' "$health" >&2
  exit 23
fi

change_started=0
printf 'QCODER_OLLAMA_MEMORY_APPLIED sha=%s health=%s memory=48g memswap=52g keepalive=30m\n' \
  "$(sha256sum "$compose_file" | awk '{print $1}')" "$health"

