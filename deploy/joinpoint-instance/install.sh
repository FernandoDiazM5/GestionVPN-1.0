#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly INSTALL_ROOT="${JOINPOINT_INSTALL_ROOT:-/opt/joinpoint}"
readonly SOURCE_DIR="${JOINPOINT_SOURCE_DIR:-}"
readonly CONFIRM_PHRASE='INSTALAR JOINPOINT'
MODE="${1:---check}"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
info() { printf '%s\n' "$1"; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Falta el requisito: $1"; }
valid_ipv4() {
  local ip="$1" IFS=. octets
  read -r -a octets <<< "$ip"
  [[ ${#octets[@]} -eq 4 ]] || return 1
  for octet in "${octets[@]}"; do [[ "$octet" =~ ^[0-9]+$ ]] && ((10#$octet <= 255)) || return 1; done
}
require_https() { [[ "$1" =~ ^https://[^/[:space:]]+/?$ ]] || fail 'JOINPOINT_CENTRAL_URL debe ser una URL HTTPS sin ruta.'; }
write_status() { printf '%s\n' "$1" > "$INSTALL_ROOT/install-status"; chmod 600 "$INSTALL_ROOT/install-status"; }

preflight() {
  [[ "$(id -u)" -eq 0 ]] || fail 'Ejecuta el instalador como root.'
  for tool in curl jq openssl docker getent install; do need "$tool"; done
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 no esta disponible.'
  [[ -n "${JOINPOINT_CENTRAL_URL:-}" ]] || fail 'Falta JOINPOINT_CENTRAL_URL.'
  require_https "$JOINPOINT_CENTRAL_URL"
  [[ -n "${JOINPOINT_PUBLIC_IP:-}" ]] || fail 'Falta JOINPOINT_PUBLIC_IP.'
  valid_ipv4 "$JOINPOINT_PUBLIC_IP" || fail 'JOINPOINT_PUBLIC_IP no es una IPv4 valida.'
  [[ "$SOURCE_DIR" = /* && -f "$SOURCE_DIR/package.json" && -f "$SOURCE_DIR/deploy/joinpoint-instance/compose.yaml" ]] \
    || fail 'JOINPOINT_SOURCE_DIR debe apuntar a una distribucion oficial completa.'
  curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "${JOINPOINT_CENTRAL_URL%/}/health" >/dev/null \
    || fail 'La Plataforma Central no responde por HTTPS.'
}

activate() {
  [[ -n "${JOINPOINT_ACTIVATION_CODE:-}" ]] || fail 'Falta JOINPOINT_ACTIVATION_CODE.'
  install -d -m 0700 "$INSTALL_ROOT" "$INSTALL_ROOT/secrets" "$INSTALL_ROOT/agent-state" "$INSTALL_ROOT/config" "$INSTALL_ROOT/tls"
  write_status PRECHECK
  openssl genpkey -algorithm ED25519 -out "$INSTALL_ROOT/secrets/instance-private.pem"
  openssl pkey -in "$INSTALL_ROOT/secrets/instance-private.pem" -pubout -out "$INSTALL_ROOT/secrets/instance-public.pem"
  chmod 600 "$INSTALL_ROOT/secrets/instance-private.pem" "$INSTALL_ROOT/secrets/instance-public.pem"
  jq -n --arg code "$JOINPOINT_ACTIVATION_CODE" --rawfile key "$INSTALL_ROOT/secrets/instance-public.pem" \
    '{code:$code,instancePublicKeyPem:$key}' > "$INSTALL_ROOT/secrets/activation-request.json"
  curl --fail --silent --show-error --connect-timeout 5 --max-time 30 \
    -H 'content-type: application/json' --data-binary "@$INSTALL_ROOT/secrets/activation-request.json" \
    "${JOINPOINT_CENTRAL_URL%/}/api/activate" > "$INSTALL_ROOT/secrets/activation-response.json"
  rm -f "$INSTALL_ROOT/secrets/activation-request.json"
  jq -e '.success == true and (.activation.instanceId|type=="string") and (.activation.fqdn|type=="string")
    and (.activation.managementCidr|test("^[0-9.]+/22$")) and (.activation.license|type=="string")
    and (.activation.licensePublicKey|type=="string")' "$INSTALL_ROOT/secrets/activation-response.json" >/dev/null \
    || fail 'La respuesta de activacion no contiene todos los campos esperados.'
  jq '{instanceId:.activation.instanceId,fqdn:.activation.fqdn,managementCidr:.activation.managementCidr,
    publicIp:$publicIp,centralUrl:$centralUrl}' --arg publicIp "$JOINPOINT_PUBLIC_IP" --arg centralUrl "$JOINPOINT_CENTRAL_URL" \
    "$INSTALL_ROOT/secrets/activation-response.json" > "$INSTALL_ROOT/instance.json"
  chmod 600 "$INSTALL_ROOT/instance.json" "$INSTALL_ROOT/secrets/activation-response.json"
  write_status ACTIVATED
}

random_hex() { openssl rand -hex "$1"; }

generate_config() {
  local fqdn instance_id db_root db_app jwt_secret auth_hmac security_secret ai_key
  fqdn="$(jq -r '.fqdn' "$INSTALL_ROOT/instance.json")"
  instance_id="$(jq -r '.instanceId' "$INSTALL_ROOT/instance.json")"
  db_root="$(random_hex 32)"; db_app="$(random_hex 32)"; jwt_secret="$(random_hex 64)"
  auth_hmac="$(random_hex 32)"; security_secret="$(random_hex 32)"; ai_key="$(random_hex 32)"
  printf '%s\n' \
    "JOINPOINT_SOURCE_DIR=$SOURCE_DIR" \
    "JOINPOINT_SERVER_ENV_FILE=$INSTALL_ROOT/config/server.env" \
    "JOINPOINT_TLS_DIR=$INSTALL_ROOT/tls" \
    "JOINPOINT_INSTANCE_PRIVATE_KEY_FILE=$INSTALL_ROOT/secrets/instance-private.pem" \
    "JOINPOINT_AGENT_STATE_DIR=$INSTALL_ROOT/agent-state" \
    "JOINPOINT_INSTANCE_ID=$instance_id" \
    "JOINPOINT_CENTRAL_URL=$JOINPOINT_CENTRAL_URL" \
    "JOINPOINT_SOFTWARE_VERSION=${JOINPOINT_SOFTWARE_VERSION:-greenfield}" \
    "DB_HOST_PORT=3307" "DB_ROOT_PASSWORD=$db_root" "DB_APP_PASSWORD=$db_app" \
    "WG0_INTENT_DIR=/opt/wg0-autosync" "VITE_FEDERATED_AUTH_ENABLED=false" \
    > "$INSTALL_ROOT/config/compose.env"
  printf '%s\n' \
    'PORT=3001' 'NODE_ENV=production' 'DATA_DIR=/data' \
    'MYSQL_HOST=127.0.0.1' 'MYSQL_PORT=3307' 'MYSQL_USER=vpn_app' "MYSQL_PASSWORD=$db_app" 'MYSQL_DATABASE=vpn_manager' 'MYSQL_POOL=10' \
    "CORS_ORIGINS=https://$fqdn" "APP_BASE_URL=https://$fqdn/" "VPS_PUBLIC_IP=$JOINPOINT_PUBLIC_IP" \
    'JWT_EXPIRES=8h' 'JWT_ACTIVE_KID=initial' "JWT_ACTIVE_SECRET=$jwt_secret" \
    "AUTH_RATE_HMAC_KEY=$auth_hmac" 'WEB_SECURITY_MODE=observe' 'WEB_SECURITY_ROLLOUT_PERCENT=0' \
    'EXPIRATION_JOB_ENABLED=true' 'MONITORING_ENABLED=true' 'AP_POLL_ENABLED=true' \
    'FEDERATED_AUTH_ENABLED=false' 'FIREBASE_PILOT_ENV=disabled' 'METRICS_ALLOW_REMOTE=0' \
    'TELEGRAM_BOT_ENABLED=false' 'GEMINI_AI_ENABLED=false' "AI_PSEUDONYM_KEY=$ai_key" \
    'SECURITY_AGENT_URL=http://127.0.0.1:8788' "SECURITY_AGENT_SECRET=$security_secret" \
    'WG0_AUTOSYNC=false' > "$INSTALL_ROOT/config/server.env"
  chmod 600 "$INSTALL_ROOT/config/compose.env" "$INSTALL_ROOT/config/server.env"
  chown -R 1000:1000 "$INSTALL_ROOT/agent-state"
  chown 1000:1000 "$INSTALL_ROOT/secrets/instance-private.pem"
  write_status CONFIGURED
}

check_dns() {
  local fqdn resolved
  fqdn="$(jq -r '.fqdn' "$INSTALL_ROOT/instance.json")"
  resolved="$(getent ahostsv4 "$fqdn" 2>/dev/null | awk '{print $1}' | sort -u || true)"
  if ! grep -Fxq "$JOINPOINT_PUBLIC_IP" <<< "$resolved"; then
    write_status PENDING_DNS_TLS
    info "PENDING_DNS_TLS: configura $fqdn para apuntar a $JOINPOINT_PUBLIC_IP y vuelve a ejecutar con --resume."
    return 10
  fi
}

case "$MODE" in
  --check)
    preflight
    [[ ! -e "$INSTALL_ROOT" ]] || fail "El destino ya existe: $INSTALL_ROOT"
    info 'PRECHECK_OK: el VPS cumple los requisitos basicos; no se modifico nada.'
    ;;
  --apply)
    preflight
    [[ "${JOINPOINT_CONFIRM:-}" == "$CONFIRM_PHRASE" ]] || fail "Define JOINPOINT_CONFIRM='$CONFIRM_PHRASE'."
    [[ ! -e "$INSTALL_ROOT" ]] || fail "El destino ya existe: usa --resume, no sobrescribas $INSTALL_ROOT."
    activate
    check_dns || exit $?
    generate_config
    write_status READY_FOR_TLS
    info 'READY_FOR_TLS: activacion y configuracion greenfield completadas; falta emitir el certificado.'
    ;;
  --resume)
    preflight
    [[ -f "$INSTALL_ROOT/install-status" && -f "$INSTALL_ROOT/instance.json" ]] || fail 'No existe una instalacion reanudable.'
    check_dns || exit $?
    [[ -f "$INSTALL_ROOT/config/compose.env" ]] || generate_config
    write_status READY_FOR_TLS
    info 'READY_FOR_TLS: DNS y configuracion greenfield validados; falta emitir el certificado.'
    ;;
  *) fail 'Uso: install.sh --check | --apply | --resume' ;;
esac
