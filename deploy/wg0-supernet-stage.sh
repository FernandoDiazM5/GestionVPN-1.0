#!/usr/bin/env bash
set -euo pipefail

conf=/etc/wireguard/wg0.conf
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/root/wg0-before-management-supernet-${stamp}.conf"
candidate=$(mktemp)
trap 'rm -f "$candidate"' EXIT

test "$(id -u)" -eq 0
test -f "$conf"
test "$(wg show wg0 peers | wc -l)" -eq 1
grep -q '^Address *= *10\.12\.250\.60/32' "$conf"

cp -a "$conf" "$backup"
chmod 600 "$backup"

if ! grep -q '^PostUp.*10\.12\.248\.' "$conf"; then
  sed -i '/^PostUp.*10\.11\.252\./a PostUp  = for i in $(seq 2 50); do ip addr add 10.12.248.$i/32 dev %i; done' "$conf"
fi
if ! grep -q '^PostDown.*10\.12\.248\.' "$conf"; then
  sed -i '/^PostDown.*10\.11\.252\./a PostDown = for i in $(seq 2 50); do ip addr del 10.12.248.$i/32 dev %i; done' "$conf"
fi
if ! grep -q '^AllowedIPs.*10\.12\.248\.0/22' "$conf"; then
  sed -i '/^AllowedIPs *=/ s/$/, 10.12.248.0\/22/' "$conf"
fi

chmod 600 "$conf"
wg-quick strip wg0 > "$candidate"

for i in $(seq 2 50); do
  ip address replace "10.12.248.${i}/32" dev wg0
done
ip route replace 10.12.248.0/22 dev wg0
wg syncconf wg0 "$candidate"

echo "backup=$backup"
echo 'staged_scan_pool=10.12.248.2-50/32'
echo 'staged_supernet=10.12.248.0/22'
