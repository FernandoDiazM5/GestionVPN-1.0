#!/usr/bin/env bash
set -euo pipefail

conf=/etc/wireguard/wg0.conf
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/root/wg0-before-old-scan-removal-${stamp}.conf"
candidate=$(mktemp)
trap 'rm -f "$candidate"' EXIT

test "$(id -u)" -eq 0
test -f "$conf"
cp -a "$conf" "$backup"
chmod 600 "$backup"

sed -i '/^PostUp.*10\.11\.252\./d; /^PostDown.*10\.11\.252\./d' "$conf"
sed -i 's/, *10\.11\.252\.0\/24//g; s/10\.11\.252\.0\/24, *//g' "$conf"
chmod 600 "$conf"
wg-quick strip wg0 > "$candidate"

for i in $(seq 2 50); do
  ip address del "10.11.252.${i}/32" dev wg0 2>/dev/null || true
done
ip route del 10.11.252.0/24 dev wg0 2>/dev/null || true
wg syncconf wg0 "$candidate"

echo "backup=$backup"
echo 'removed_scan_pool=10.11.252.0/24'
