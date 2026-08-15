#!/usr/bin/env bash
set -euo pipefail

read -r -d '' sql <<'SQL' || true
START TRANSACTION;
SET @actor=(SELECT id FROM users WHERE deleted_at IS NULL AND is_platform_admin=1 ORDER BY created_at LIMIT 1);
SET @existing=(SELECT value FROM app_settings WHERE `key`='management_supernet' LIMIT 1);
INSERT INTO app_settings (`key`, value, updated_at)
SELECT 'management_supernet', '10.12.248.0/22', UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000
WHERE (SELECT COUNT(*) FROM nodes)=0 AND @actor IS NOT NULL
  AND (@existing IS NULL OR @existing='10.12.248.0/22')
ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at);
INSERT INTO platform_security_audit
  (id, actor_user_id, action, target, jail, category, reason, outcome, detail, request_ip, created_at)
SELECT UUID(), @actor, 'MGMT_SUPERNET_SET', '10.12.248.0/22', NULL, 'NETWORK_CONFIG',
       'Bootstrap controlado posterior a preparación del VPS',
       'SUCCESS',
       JSON_OBJECT('supernet','10.12.248.0/22','scan','10.12.248.0/24','clients','10.12.249.0/24','vps','10.12.250.0/24','admin','10.12.251.0/24'),
       '127.0.0.1', UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000
WHERE @existing IS NULL AND (SELECT COUNT(*) FROM nodes)=0 AND @actor IS NOT NULL;
COMMIT;
SELECT value FROM app_settings WHERE `key`='management_supernet';
SQL

result=$(printf '%s\n' "$sql" | docker exec -i vpn-db sh -lc \
  'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -N -u root "$MARIADB_DATABASE"')
test "$result" = '10.12.248.0/22'
echo "management_supernet=$result"
