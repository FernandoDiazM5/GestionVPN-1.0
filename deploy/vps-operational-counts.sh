#!/usr/bin/env bash
set -euo pipefail

read -r -d '' sql <<'SQL' || true
SELECT 'nodes', COUNT(*) FROM nodes
UNION ALL SELECT 'node_ssh_creds', COUNT(*) FROM node_ssh_creds
UNION ALL SELECT 'node_tags', COUNT(*) FROM node_tags
UNION ALL SELECT 'node_history', COUNT(*) FROM node_history
UNION ALL SELECT 'torres', COUNT(*) FROM torres
UNION ALL SELECT 'aps', COUNT(*) FROM aps
UNION ALL SELECT 'cpes', COUNT(*) FROM cpes
UNION ALL SELECT 'active_sessions', COUNT(*) FROM tunnel_user_sessions WHERE status='ACTIVE'
UNION ALL SELECT 'assignments', COUNT(*) FROM tunnel_assignments
UNION ALL SELECT 'monitoring_nodes', COUNT(*) FROM monitoring_state WHERE target_kind='node'
UNION ALL SELECT 'workspaces', COUNT(*) FROM workspaces WHERE deleted_at IS NULL
UNION ALL SELECT 'platform_admins', COUNT(*) FROM users WHERE deleted_at IS NULL AND is_platform_admin=1;

SELECT 'aps_without_node', COUNT(*) FROM aps WHERE node_id IS NULL
UNION ALL SELECT 'ap_groups', COUNT(*) FROM ap_groups
UNION ALL SELECT 'cpes_without_ap', COUNT(*) FROM cpes c LEFT JOIN aps a ON a.id=c.ap_id WHERE a.id IS NULL
UNION ALL SELECT 'assignments_without_node', COUNT(*) FROM tunnel_assignments ta LEFT JOIN nodes n ON n.workspace_id=ta.workspace_id AND (n.ppp_user=ta.tunnel_id OR n.nombre_vrf=ta.tunnel_id) WHERE n.id IS NULL
UNION ALL SELECT 'monitoring_without_node', COUNT(*) FROM monitoring_state ms LEFT JOIN nodes n ON n.workspace_id=ms.workspace_id AND (n.ppp_user=ms.target_id OR n.nombre_vrf=ms.target_id) WHERE ms.target_kind='node' AND n.id IS NULL
UNION ALL SELECT 'scan_ip_old_pool', COUNT(*) FROM workspace_scan_ip WHERE scan_ip LIKE '10.11.252.%'
UNION ALL SELECT 'scan_ip_new_pool', COUNT(*) FROM workspace_scan_ip WHERE scan_ip LIKE '10.12.248.%';

SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, rc.CONSTRAINT_NAME, rc.DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS rc
JOIN information_schema.KEY_COLUMN_USAGE kcu
  ON kcu.CONSTRAINT_SCHEMA=rc.CONSTRAINT_SCHEMA AND kcu.CONSTRAINT_NAME=rc.CONSTRAINT_NAME
WHERE rc.CONSTRAINT_SCHEMA=DATABASE()
  AND ((kcu.TABLE_NAME='aps' AND kcu.COLUMN_NAME='node_id')
    OR (kcu.TABLE_NAME='torres' AND kcu.COLUMN_NAME='node_id')
    OR (kcu.TABLE_NAME='cpes' AND kcu.COLUMN_NAME='ap_id'))
ORDER BY kcu.TABLE_NAME;

SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('trg_nodes_cleanup_before_delete','trg_nodes_cleanup_after_delete')
ORDER BY TRIGGER_NAME;

SELECT `key`, value FROM app_settings
WHERE `key` IN ('management_supernet','core_provisioned_at','scan_mode')
ORDER BY `key`;
SQL

printf '%s\n' "$sql" | docker exec -i vpn-db sh -lc \
  'MYSQL_PWD="$MARIADB_PASSWORD" exec mariadb -N -u"$MARIADB_USER" "$MARIADB_DATABASE"'
