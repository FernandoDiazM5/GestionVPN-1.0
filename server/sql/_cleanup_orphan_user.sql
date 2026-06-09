-- Hard-delete del usuario huérfano fernandodiazm.5@gmail.com
SET @uid := '407137f5-2e1a-45b8-bafa-cd0c685002ba';
SET @wsid := (SELECT id FROM workspaces WHERE owner_id = @uid LIMIT 1);

START TRANSACTION;

-- Auditoría / sesiones
DELETE FROM tunnel_session_logs   WHERE workspace_id = @wsid OR user_id = @uid;
DELETE FROM tunnel_user_sessions  WHERE workspace_id = @wsid OR user_id = @uid;
DELETE FROM user_mgmt_ips         WHERE workspace_id = @wsid OR user_id = @uid;
DELETE FROM tunnel_logs           WHERE workspace_id = @wsid;
DELETE FROM tunnel_assignments    WHERE workspace_id = @wsid;
DELETE FROM member_wireguard      WHERE workspace_id = @wsid;
DELETE FROM workspace_routers     WHERE workspace_id = @wsid;
DELETE FROM invitations           WHERE workspace_id = @wsid;

-- Equipos / red (CPEs por separado porque FK ON DELETE SET NULL)
DELETE t FROM torres t INNER JOIN nodes n ON t.node_id = n.id WHERE n.workspace_id = @wsid;
DELETE c FROM cpes c
  WHERE c.ap_id IN (
    SELECT a.id FROM aps a JOIN ap_groups g ON g.id = a.ap_group_id WHERE g.workspace_id = @wsid
  );
DELETE FROM ap_groups        WHERE workspace_id = @wsid;
DELETE FROM nodes            WHERE workspace_id = @wsid;
DELETE FROM mgmt_peer_owners WHERE workspace_id = @wsid;

-- Workspace + miembros + user
DELETE FROM workspace_members WHERE workspace_id = @wsid;
DELETE FROM workspaces        WHERE id = @wsid;
DELETE FROM users             WHERE id = @uid;

COMMIT;

SELECT 'Cleanup OK' AS resultado, ROW_COUNT() AS users_eliminados;
