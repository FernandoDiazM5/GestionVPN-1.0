#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root="${JOINPOINT_CENTRAL_ROOT:-/opt/joinpoint-central}"; file="${1:-}"
[[ -f "$file" ]] || { echo 'Indica un backup existente' >&2; exit 1; }
resolved="$(realpath "$file")"; case "$resolved" in "$root"/backups/*) ;; *) echo 'Backup fuera del directorio permitido' >&2; exit 1;; esac
[[ ${JOINPOINT_RESTORE_CONFIRM:-} == 'RESTAURAR CENTRAL JOINPOINT' ]] || { echo 'Confirmacion requerida' >&2; exit 1; }
gzip -t "$resolved"; "$root/bundle/deploy/joinpoint-central/backup.sh"
compose=(docker compose --env-file "$root/config/compose.env" -f "$root/bundle/deploy/joinpoint-central/compose.yaml")
password="$(sed -n 's/^DB_ROOT_PASSWORD=//p' "$root/config/compose.env")"
"${compose[@]}" stop proxy central
gzip -dc "$resolved" | "${compose[@]}" exec -T db mariadb -u root -p"$password" joinpoint_control
"${compose[@]}" up -d central proxy
