#!/usr/bin/env bash
set -euo pipefail

stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="/root/pre-orphan-site-cleanup-${stamp}"
backup_file="${backup_dir}/vpn_manager.sql.gz"
verify_db="vpn_manager_verify_${stamp//[^0-9]/}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

docker exec vpn-db sh -lc \
  'MYSQL_PWD="$MARIADB_PASSWORD" exec mariadb-dump --single-transaction --routines --triggers -u"$MARIADB_USER" "$MARIADB_DATABASE"' \
  | gzip -9 > "$backup_file"
chmod 600 "$backup_file"
gzip -t "$backup_file"
sha256sum "$backup_file" > "${backup_file}.sha256"
chmod 600 "${backup_file}.sha256"

docker exec vpn-db sh -lc "MYSQL_PWD=\"\$MARIADB_ROOT_PASSWORD\" mariadb -uroot -e 'CREATE DATABASE ${verify_db} CHARACTER SET utf8mb4'"
gzip -dc "$backup_file" | docker exec -i vpn-db sh -lc \
  "MYSQL_PWD=\"\$MARIADB_ROOT_PASSWORD\" mariadb -uroot ${verify_db}"
docker exec vpn-db sh -lc "MYSQL_PWD=\"\$MARIADB_ROOT_PASSWORD\" mariadb -uroot -N -e 'SELECT COUNT(*) FROM ${verify_db}.nodes'"
docker exec vpn-db sh -lc "MYSQL_PWD=\"\$MARIADB_ROOT_PASSWORD\" mariadb -uroot -e 'DROP DATABASE ${verify_db}'"

read -r -d '' sql <<'SQL' || true
START TRANSACTION;
DELETE FROM cpes;
DELETE FROM ap_groups;
DELETE FROM tags;
DELETE FROM tunnel_assignments;
DELETE FROM monitoring_state WHERE target_kind='node';
UPDATE invitations SET status='REVOKED' WHERE status='PENDING' AND tunnel_id IS NOT NULL;
UPDATE workspace_scan_ip
   SET scan_ip=CONCAT('10.12.248.', SUBSTRING_INDEX(scan_ip, '.', -1)), updated_at=UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000
 WHERE scan_ip LIKE '10.11.252.%';
COMMIT;

ALTER TABLE aps DROP FOREIGN KEY fk_ap_node;
ALTER TABLE aps ADD CONSTRAINT fk_ap_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE;
ALTER TABLE torres DROP FOREIGN KEY fk_torre_node;
ALTER TABLE torres ADD CONSTRAINT fk_torre_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE;
ALTER TABLE cpes DROP FOREIGN KEY fk_cpe_ap;
ALTER TABLE cpes ADD CONSTRAINT fk_cpe_ap FOREIGN KEY (ap_id) REFERENCES aps(id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS trg_nodes_cleanup_before_delete;
DELIMITER $$
CREATE TRIGGER trg_nodes_cleanup_before_delete BEFORE DELETE ON nodes
FOR EACH ROW BEGIN
  DELETE FROM tunnel_assignments WHERE workspace_id=OLD.workspace_id AND tunnel_id IN (OLD.ppp_user, OLD.nombre_vrf);
  DELETE FROM monitoring_state WHERE workspace_id=OLD.workspace_id AND target_kind='node' AND target_id IN (OLD.ppp_user, OLD.nombre_vrf);
  UPDATE invitations SET status='REVOKED' WHERE workspace_id=OLD.workspace_id AND status='PENDING' AND tunnel_id IN (OLD.ppp_user, OLD.nombre_vrf);
END$$
DELIMITER ;
DROP TRIGGER IF EXISTS trg_nodes_cleanup_after_delete;
DELIMITER $$
CREATE TRIGGER trg_nodes_cleanup_after_delete AFTER DELETE ON nodes
FOR EACH ROW DELETE g FROM ap_groups g LEFT JOIN aps a ON a.ap_group_id=g.id
WHERE g.workspace_id=OLD.workspace_id AND a.id IS NULL$$
DELIMITER ;
SQL

printf '%s\n' "$sql" | docker exec -i vpn-db sh -lc \
  'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot "$MARIADB_DATABASE"'

echo "backup=$backup_file"
