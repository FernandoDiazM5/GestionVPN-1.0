#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly INSTALL_ROOT="${JOINPOINT_INSTALL_ROOT:-/opt/joinpoint}"
readonly CERTBOT_IMAGE='certbot/certbot:v5.7.0'
fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[[ "$(id -u)" -eq 0 ]] || fail 'La renovacion requiere root.'
[[ -f "$INSTALL_ROOT/instance.json" && -f "$INSTALL_ROOT/config/compose.env" ]] || fail 'Instancia Joinpoint incompleta.'
fqdn="$(jq -r '.fqdn' "$INSTALL_ROOT/instance.json")"
source_dir="$(sed -n 's/^JOINPOINT_SOURCE_DIR=//p' "$INSTALL_ROOT/config/compose.env")"
[[ -n "$source_dir" && -f "$source_dir/deploy/joinpoint-instance/compose.yaml" ]] || fail 'Distribucion oficial no disponible.'

docker run --rm \
  -v "$INSTALL_ROOT/acme:/etc/letsencrypt" \
  -v "$INSTALL_ROOT/acme-work:/var/lib/letsencrypt" \
  -v "$INSTALL_ROOT/acme-logs:/var/log/letsencrypt" \
  -v "$INSTALL_ROOT/acme-challenge:/var/www/certbot" \
  "$CERTBOT_IMAGE" renew --webroot --webroot-path /var/www/certbot --non-interactive

live="$INSTALL_ROOT/acme/live/$fqdn"
install -m 0644 "$live/fullchain.pem" "$INSTALL_ROOT/tls/fullchain.pem"
install -m 0600 "$live/privkey.pem" "$INSTALL_ROOT/tls/privkey.pem"
openssl x509 -in "$INSTALL_ROOT/tls/fullchain.pem" -noout -checkend 86400 >/dev/null || fail 'Certificado renovado invalido.'
docker compose --env-file "$INSTALL_ROOT/config/compose.env" -f "$source_dir/deploy/joinpoint-instance/compose.yaml" \
  exec -T frontend nginx -t
docker compose --env-file "$INSTALL_ROOT/config/compose.env" -f "$source_dir/deploy/joinpoint-instance/compose.yaml" \
  exec -T frontend nginx -s reload
