#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf 'rollback-qwen-route.sh must run as root\n' >&2
  exit 20
fi
backup_dir=${1:-}
case "$backup_dir" in
  /home/forge/services/qwen-route/backups/*) ;;
  *) printf 'pass one exact Qwen route backup directory\n' >&2; exit 21 ;;
esac
if [[ ! -d "$backup_dir" ]]; then
  printf 'backup directory not found\n' >&2
  exit 22
fi

restore_path() {
  local name=$1
  local destination=$2
  if [[ -e "$backup_dir/$name" || -L "$backup_dir/$name" ]]; then
    install -d "$(dirname "$destination")"
    cp -a "$backup_dir/$name" "$destination"
  elif [[ -f "$backup_dir/$name.absent" ]]; then
    if [[ -e "$destination" || -L "$destination" ]]; then
      mv "$destination" "$backup_dir/$name.removed-during-rollback"
    fi
  else
    printf 'backup manifest is incomplete for %s\n' "$name" >&2
    exit 23
  fi
}

systemctl stop echo-qwen-route.service 2>/dev/null || true
restore_path docker-compose.yml /home/forge/services/ollama-qwen-home/docker-compose.yml
restore_path echo-qwen-home.service /etc/systemd/system/echo-qwen-home.service
restore_path 90-qwen-runtime.conf /etc/systemd/system/echo-qwen-home.service.d/90-qwen-runtime.conf
restore_path echo-qwen-route.service /etc/systemd/system/echo-qwen-route.service
restore_path qwen-route.env /etc/echo/qwen-route.env
restore_path titlehound-qwen-lease.conf /etc/systemd/system/echo-titlehound.service.d/10-qwen-dual-gpu-lease.conf
restore_path qwen-dual-gpu.lease /etc/echo/qwen-dual-gpu.lease
systemctl daemon-reload
systemctl restart echo-qwen-home.service
if [[ -f /etc/systemd/system/echo-qwen-route.service ]]; then
  systemctl restart echo-qwen-route.service
fi
if [[ -f "$backup_dir/titlehound-before.enabled" ]] &&
   grep -qx enabled "$backup_dir/titlehound-before.enabled"; then
  systemctl enable echo-titlehound.service >/dev/null
fi
if [[ -f "$backup_dir/titlehound-before.state" ]] &&
   grep -Eqx 'active|activating' "$backup_dir/titlehound-before.state"; then
  systemctl reset-failed echo-titlehound.service 2>/dev/null || true
  systemctl start echo-titlehound.service
fi
docker volume inspect ollama_ollama_data >/dev/null
printf 'QWEN_ROUTE_ROLLED_BACK backup=%s volume=ollama_ollama_data\n' "$backup_dir"
