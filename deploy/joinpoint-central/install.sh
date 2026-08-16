#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root="${JOINPOINT_CENTRAL_ROOT:-/opt/joinpoint-central}"; bundle="${JOINPOINT_CENTRAL_BUNDLE:-$(cd "$(dirname "$0")/../.." && pwd)}"
mode="${1:---check}"; fail(){ echo "ERROR: $*" >&2; exit 1; }; need(){ command -v "$1" >/dev/null || fail "Falta $1"; }
for x in docker curl openssl getent systemctl; do need "$x"; done
[[ ${JOINPOINT_CENTRAL_FQDN:-} =~ ^[a-z0-9.-]+$ ]] || fail 'FQDN inválido'; [[ ${JOINPOINT_CENTRAL_VERSION:-} != latest && -n ${JOINPOINT_CENTRAL_VERSION:-} ]] || fail 'Versión inmutable obligatoria'
[[ $mode != --check ]] || { [[ ! -e $root ]] || fail 'Destino existente'; echo PRECHECK_OK; exit; }
[[ ${JOINPOINT_CONFIRM:-} == 'INSTALAR CENTRAL JOINPOINT' ]] || fail 'Confirmación requerida'
ip="$(curl -4fsS https://api.ipify.org)"; getent ahostsv4 "$JOINPOINT_CENTRAL_FQDN" | awk '{print $1}' | grep -Fxq "$ip" || fail 'DNS aún no apunta a este VPS'
mkdir -p "$root"/{config,secrets,tls,acme,backups}; chmod 700 "$root"/{config,secrets,backups}
[[ -f $root/secrets/license-signing.pem ]] || openssl genpkey -algorithm ED25519 -out "$root/secrets/license-signing.pem"
rand(){ openssl rand -hex "$1"; }; mfa="$(openssl rand -base64 32)"
[[ -f $root/config/central.env ]] || printf '%s\n' "CONTROL_ADMIN_MFA_ENCRYPTION_KEY=$mfa" "CONTROL_ADMIN_SESSION_PEPPER=$(rand 32)" "ACTIVATION_CODE_PEPPER=$(rand 32)" "ACTIVATION_RATE_LIMIT_PEPPER=$(rand 32)" 'LICENSE_SIGNING_KEY_ID=central-1' > "$root/config/central.env"
[[ -f $root/config/compose.env ]] || printf '%s\n' "JOINPOINT_CENTRAL_IMAGE=ghcr.io/fernandodiazm5/joinpoint-central:$JOINPOINT_CENTRAL_VERSION" "JOINPOINT_CENTRAL_ENV_FILE=$root/config/central.env" "LICENSE_SIGNING_PRIVATE_KEY_FILE=$root/secrets/license-signing.pem" "CENTRAL_NGINX_CONFIG=$root/config/nginx.conf" "CENTRAL_TLS_DIR=$root/tls" "DB_ROOT_PASSWORD=$(rand 32)" "DB_APP_PASSWORD=$(rand 32)" > "$root/config/compose.env"
sed "s/__CENTRAL_FQDN__/$JOINPOINT_CENTRAL_FQDN/g" "$bundle/deploy/joinpoint-central/nginx.conf.template" > "$root/config/nginx.conf"
[[ -f $root/tls/fullchain.pem ]] || { [[ ${JOINPOINT_ACME_AGREE_TOS:-} == yes && -n ${JOINPOINT_TLS_EMAIL:-} ]] || fail 'Faltan aceptación ACME/correo'; docker run --rm -p 80:80 -v "$root/acme:/etc/letsencrypt" certbot/certbot:v5.7.0 certonly --standalone -n --agree-tos --no-eff-email -m "$JOINPOINT_TLS_EMAIL" -d "$JOINPOINT_CENTRAL_FQDN"; cp "$root/acme/live/$JOINPOINT_CENTRAL_FQDN/fullchain.pem" "$root/tls/"; cp "$root/acme/live/$JOINPOINT_CENTRAL_FQDN/privkey.pem" "$root/tls/"; }
compose=(docker compose --env-file "$root/config/compose.env" -f "$bundle/deploy/joinpoint-central/compose.yaml"); "${compose[@]}" pull; "${compose[@]}" up -d
for _ in {1..30}; do curl -fsS --resolve "$JOINPOINT_CENTRAL_FQDN:443:127.0.0.1" "https://$JOINPOINT_CENTRAL_FQDN/health" >/dev/null && { echo RUNNING; exit; }; sleep 5; done
"${compose[@]}" stop proxy central; fail 'Health gate falló; MariaDB preservada'
