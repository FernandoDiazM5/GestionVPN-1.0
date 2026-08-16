#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root="${JOINPOINT_CENTRAL_ROOT:-/opt/joinpoint-central}"
read -rp 'Correo del administrador: ' CONTROL_ADMIN_BOOTSTRAP_EMAIL
read -rp 'Nombre: ' CONTROL_ADMIN_BOOTSTRAP_NAME
read -rsp 'Contraseña (mínimo 12): ' CONTROL_ADMIN_BOOTSTRAP_PASSWORD; printf '\n'
export CONTROL_ADMIN_BOOTSTRAP_EMAIL CONTROL_ADMIN_BOOTSTRAP_NAME CONTROL_ADMIN_BOOTSTRAP_PASSWORD
docker compose --env-file "$root/config/compose.env" -f "$root/bundle/deploy/joinpoint-central/compose.yaml" \
  run --rm -T central node control-plane/src/scripts/bootstrapAdmin.js
unset CONTROL_ADMIN_BOOTSTRAP_EMAIL CONTROL_ADMIN_BOOTSTRAP_NAME CONTROL_ADMIN_BOOTSTRAP_PASSWORD
