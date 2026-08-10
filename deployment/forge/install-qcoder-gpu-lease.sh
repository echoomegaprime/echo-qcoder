#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf 'run this installer as root\n' >&2
  exit 20
fi

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
required=(
  qcoder_gpu_lease.py
  smoke-qcoder-gpu-lease.sh
  qcoder-gpu-lease-recover.service
  qcoder-gpu-lease-recover.timer
)
for name in "${required[@]}"; do
  if [[ ! -f "$source_dir/$name" ]]; then
    printf 'missing deployment artifact: %s\n' "$name" >&2
    exit 21
  fi
done

python3 -m py_compile "$source_dir/qcoder_gpu_lease.py"
install -o root -g root -m 0755 "$source_dir/qcoder_gpu_lease.py" /usr/local/sbin/qcoder-gpu-lease
install -o root -g root -m 0755 \
  "$source_dir/smoke-qcoder-gpu-lease.sh" \
  /usr/local/sbin/qcoder-gpu-lease-smoke
install -o root -g root -m 0644 \
  "$source_dir/qcoder-gpu-lease-recover.service" \
  /etc/systemd/system/qcoder-gpu-lease-recover.service
install -o root -g root -m 0644 \
  "$source_dir/qcoder-gpu-lease-recover.timer" \
  /etc/systemd/system/qcoder-gpu-lease-recover.timer

systemctl daemon-reload
systemctl enable --now qcoder-gpu-lease-recover.timer >/dev/null
/usr/local/sbin/qcoder-gpu-lease recover-stale >/dev/null
systemctl is-active --quiet qcoder-gpu-lease-recover.timer
/usr/local/sbin/qcoder-gpu-lease status
