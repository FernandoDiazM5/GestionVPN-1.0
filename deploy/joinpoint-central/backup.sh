#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root="${JOINPOINT_CENTRAL_ROOT:-/opt/joinpoint-central}"
keep="${CENTRAL_BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$root/backups"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose --env-file "$root/config/compose.env" -f "$root/bundle/deploy/joinpoint-central/compose.yaml" \
  exec -T db mariadb-dump --single-transaction -u root -p"$(sed -n 's/^DB_ROOT_PASSWORD=//p' "$root/config/compose.env")" joinpoint_control \
  | gzip -9 > "$root/backups/joinpoint-control-$stamp.sql.gz"
gzip -t "$root/backups/joinpoint-control-$stamp.sql.gz"
find "$root/backups" -type f -name 'joinpoint-control-*.sql.gz' -mtime "+$keep" -delete
