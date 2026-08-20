#!/usr/bin/env bash
set -Eeuo pipefail

compose_dir=${QWEN_COMPOSE_DIR:-/home/forge/services/ollama-qwen-home}
compose_file=${QWEN_COMPOSE_FILE:-$compose_dir/docker-compose.yml}
container=${QWEN_OLLAMA_CONTAINER:-echo-ollama-qwen27b}

cd "$compose_dir"
docker compose -f "$compose_file" config --quiet
docker compose -f "$compose_file" up -d --remove-orphans qwen >/dev/null

container_id=$(docker compose -f "$compose_file" ps -q qwen)
if [[ -z "$container_id" ]]; then
  printf 'QWEN_CONTAINER_MISSING\n' >&2
  exit 20
fi

health=starting
for _ in $(seq 1 90); do
  state=$(docker inspect --format '{{.State.Status}}' "$container_id")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
  if [[ "$state" == running && "$health" == healthy ]]; then
    break
  fi
  if [[ "$state" == exited || "$state" == dead ]]; then
    printf 'QWEN_CONTAINER_TERMINAL state=%s health=%s\n' "$state" "$health" >&2
    exit 21
  fi
  sleep 2
done

if [[ "$health" != healthy ]]; then
  printf 'QWEN_CONTAINER_NOT_HEALTHY health=%s\n' "$health" >&2
  exit 22
fi

printf 'QWEN_CONTAINER_SUPERVISED id=%s health=%s\n' "${container_id:0:12}" "$health"
exit_code=$(docker wait "$container_id")
printf 'QWEN_CONTAINER_EXITED id=%s exit_code=%s\n' "${container_id:0:12}" "$exit_code" >&2
exit 23
