#!/usr/bin/env bash
set -euo pipefail

conf=/etc/wireguard/wg0.conf
intent=/opt/wg0-autosync/allowedips.desired
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/root/wg0-before-obsolete-route-removal-${stamp}.conf"
intent_backup="/root/wg0-intent-before-obsolete-route-removal-${stamp}.txt"
candidate=$(mktemp)
trap 'rm -f "$candidate"' EXIT

test "$(id -u)" -eq 0
test "$(wg show wg0 peers | wc -l)" -eq 1
cp -a "$conf" "$backup"
chmod 600 "$backup"
if test -f "$intent"; then cp -a "$intent" "$intent_backup"; chmod 600 "$intent_backup"; fi

sed -i 's|^AllowedIPs *=.*$|AllowedIPs = 10.12.248.0/22|' "$conf"
: > "$intent"
chmod 600 "$conf"
wg-quick strip wg0 > "$candidate"
wg syncconf wg0 "$candidate"

ip -4 route show dev wg0 | awk '{print $1}' | while read -r network; do
  test "$network" = '10.12.248.0/22' || ip route del "$network" dev wg0 2>/dev/null || true
done
ip route replace 10.12.248.0/22 dev wg0

echo "backup=$backup"
echo "intent_backup=$intent_backup"
echo 'allowed_ips=10.12.248.0/22'
