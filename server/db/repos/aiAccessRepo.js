const { query } = require('../mysql');

async function getForUser(userId, runQuery = query) {
  const rows = await runQuery(
    `SELECT enabled, enabled_at, disabled_at, updated_at
       FROM ai_moderator_access WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  return {
    enabled: !!row?.enabled,
    enabled_at: row?.enabled_at == null ? null : Number(row.enabled_at),
    disabled_at: row?.disabled_at == null ? null : Number(row.disabled_at),
    updated_at: row?.updated_at == null ? null : Number(row.updated_at),
  };
}

async function setForModerator({ userId, enabled, changedByAdmin }, runQuery = query) {
  const owners = await runQuery(
    `SELECT u.id, wm.workspace_id
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
        AND wm.role = 'OWNER' AND wm.deleted_at IS NULL
       JOIN workspaces w ON w.id = wm.workspace_id AND w.deleted_at IS NULL
      WHERE u.id = ? AND u.deleted_at IS NULL AND u.disabled_at IS NULL
        AND u.is_platform_admin = 0 LIMIT 1`,
    [userId]
  );
  if (!owners.length) return null;
  const now = Date.now();
  const workspaceId = owners[0].workspace_id;
  await runQuery(
    `INSERT INTO ai_moderator_access
       (user_id, workspace_id, enabled, changed_by_admin, enabled_at, disabled_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       workspace_id = VALUES(workspace_id), enabled = VALUES(enabled),
       changed_by_admin = VALUES(changed_by_admin),
       enabled_at = VALUES(enabled_at), disabled_at = VALUES(disabled_at),
       updated_at = VALUES(updated_at)`,
    [userId, workspaceId, enabled ? 1 : 0, changedByAdmin, enabled ? now : null, enabled ? null : now, now, now]
  );
  return getForUser(userId, runQuery);
}

module.exports = { getForUser, setForModerator };
