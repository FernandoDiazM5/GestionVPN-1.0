#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly INSTALL_ROOT="${JOINPOINT_INSTALL_ROOT:-/opt/joinpoint}"
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
  curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "${JOINPOINT_CENTRAL_URL%/}/health" >/dev/null \
    || fail 'La Plataforma Central no responde por HTTPS.'
}

activate() {
  [[ -n "${JOINPOINT_ACTIVATION_CODE:-}" ]] || fail 'Falta JOINPOINT_ACTIVATION_CODE.'
  install -d -m 0700 "$INSTALL_ROOT" "$INSTALL_ROOT/secrets" "$INSTALL_ROOT/agent-state"
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
    write_status READY_FOR_TLS
    info 'READY_FOR_TLS: activacion e identidad completadas; falta emitir/montar el certificado antes de iniciar servicios.'
    ;;
  --resume)
    preflight
    [[ -f "$INSTALL_ROOT/install-status" && -f "$INSTALL_ROOT/instance.json" ]] || fail 'No existe una instalacion reanudable.'
    check_dns || exit $?
    write_status READY_FOR_TLS
    info 'READY_FOR_TLS: DNS validado; falta emitir/montar el certificado antes de iniciar servicios.'
    ;;
  *) fail 'Uso: install.sh --check | --apply | --resume' ;;
esac
