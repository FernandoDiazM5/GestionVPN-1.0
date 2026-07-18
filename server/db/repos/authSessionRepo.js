const { query, withTransaction } = require('../mysql');

async function create({ jti, userId, expiresAt }) {
  const now = Date.now();
  await query(
    `INSERT INTO auth_sessions (jti, user_id, expires_at, revoked_at, created_at)
     VALUES (?,?,?,NULL,?)`,
    [jti, userId, expiresAt, now]
  );
}

async function rotate({ previousJti, jti, userId, expiresAt }) {
  const now = Date.now();
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO auth_sessions (jti, user_id, expires_at, revoked_at, created_at)
       VALUES (?,?,?,NULL,?)`,
      [jti, userId, expiresAt, now]
    );
    const result = await tx.query(
      `UPDATE auth_sessions SET revoked_at = ?
       WHERE jti = ? AND user_id = ? AND revoked_at IS NULL`,
      [now, previousJti, userId]
    );
    if (Number(result.affectedRows || 0) !== 1) throw new Error('La sesión anterior ya no está activa');
  });
}

async function replaceAll({ jti, userId, expiresAt }) {
  const now = Date.now();
  await withTransaction(async (tx) => {
    await tx.query(
      'UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      [now, userId]
    );
    await tx.query(
      `INSERT INTO auth_sessions (jti, user_id, expires_at, revoked_at, created_at)
       VALUES (?,?,?,NULL,?)`,
      [jti, userId, expiresAt, now]
    );
  });
}

async function revoke(jti, userId) {
  const result = await query(
    'UPDATE auth_sessions SET revoked_at = ? WHERE jti = ? AND user_id = ? AND revoked_at IS NULL',
    [Date.now(), jti, userId]
  );
  return Number(result.affectedRows || 0) === 1;
}

async function revokeAll(userId) {
  const result = await query(
    'UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    [Date.now(), userId]
  );
  return Number(result.affectedRows || 0);
}

async function findState({ jti, userId, workspaceId }) {
  const rows = await query(
    `SELECT s.expires_at, s.revoked_at,
            u.email, u.deleted_at, u.disabled_at, u.is_platform_admin,
            wm.role AS membership_role, w.id AS workspace_exists
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN workspace_members wm
         ON wm.user_id = u.id AND wm.workspace_id = ? AND wm.deleted_at IS NULL
       LEFT JOIN workspaces w
         ON w.id = ? AND w.deleted_at IS NULL
      WHERE s.jti = ? AND s.user_id = ?
      LIMIT 1`,
    [workspaceId, workspaceId, jti, userId]
  );
  return rows[0] || null;
}

async function purgeExpired(cutoff = Date.now()) {
  const result = await query(
    'DELETE FROM auth_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)',
    [cutoff, cutoff - 7 * 86400000]
  );
  return Number(result.affectedRows || 0);
}

module.exports = { create, rotate, replaceAll, revoke, revokeAll, findState, purgeExpired };
