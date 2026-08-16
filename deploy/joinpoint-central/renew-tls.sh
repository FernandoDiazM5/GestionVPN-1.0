#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root="${JOINPOINT_CENTRAL_ROOT:-/opt/joinpoint-central}"
compose=(docker compose --env-file "$root/config/compose.env" -f "$root/bundle/deploy/joinpoint-central/compose.yaml")
fqdn="$(sed -n 's/^CENTRAL_FQDN=//p' "$root/config/compose.env")"
[[ -n "$fqdn" ]] || { echo 'FQDN no configurado' >&2; exit 1; }
docker run --rm -v "$root/acme:/etc/letsencrypt" -v "$root/acme-challenge:/var/www/certbot" certbot/certbot:v5.7.0 renew --webroot --webroot-path /var/www/certbot --non-interactive
install -m 0644 "$root/acme/live/$fqdn/fullchain.pem" "$root/tls/fullchain.pem"
install -m 0600 "$root/acme/live/$fqdn/privkey.pem" "$root/tls/privkey.pem"
openssl x509 -in "$root/tls/fullchain.pem" -noout -checkend 86400 >/dev/null
"${compose[@]}" exec -T proxy nginx -t
"${compose[@]}" exec -T proxy nginx -s reload
