const crypto = require('crypto');
const { query } = require('../mysql');

async function touchAdminIp({ sourceIp, userId, now = Date.now() }) {
  await query(`INSERT INTO platform_security_active_admin_ips (source_ip,user_id,last_seen_at)
    VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),last_seen_at=VALUES(last_seen_at)`,
  [sourceIp, userId, now]);
}

async function listActiveAdminIps(since) {
  const rows = await query('SELECT source_ip FROM platform_security_active_admin_ips WHERE last_seen_at>=?', [since]);
  return rows.map((row) => row.source_ip);
}

async function purgeAdminIps(before) {
  const result = await query('DELETE FROM platform_security_active_admin_ips WHERE last_seen_at<?', [before]);
  return Number(result.affectedRows || 0);
}

async function claim({ idempotencyKey, sourceIp, recommendation, jail, now = Date.now() }) {
  try {
    const id = crypto.randomUUID();
    await query(`INSERT INTO web_security_actions
      (id,idempotency_key,source_ip,recommendation,jail,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'PENDING',?,?)`,
    [id, idempotencyKey, sourceIp, recommendation, jail, now, now]);
    return id;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return null;
    throw error;
  }
}

async function complete({ id, status, detail = null, expiresAt = null, now = Date.now() }) {
  await query('UPDATE web_security_actions SET status=?,detail=?,expires_at=?,updated_at=? WHERE id=?',
    [status, detail ? JSON.stringify(detail) : null, expiresAt, now, id]);
}

async function recentActions(limit = 100) {
  return query(`SELECT id,source_ip,recommendation,jail,status,detail,expires_at,created_at,updated_at
    FROM web_security_actions ORDER BY created_at DESC LIMIT ?`, [Number(limit)]);
}

async function countAppliedSince({ sourceIp, jail, since }) {
  const rows = await query(`SELECT COUNT(*) AS total FROM web_security_actions
    WHERE source_ip=? AND jail=? AND status='APPLIED' AND created_at>=?`, [sourceIp, jail, since]);
  return Number(rows[0]?.total || 0);
}

async function hasActiveTemporary({ sourceIp, jail, now = Date.now() }) {
  const rows = await query(`SELECT 1 AS active FROM web_security_actions
    WHERE source_ip=? AND jail=? AND status='APPLIED' AND expires_at>? LIMIT 1`,
  [sourceIp, jail, now]);
  return rows.length > 0;
}

module.exports = { touchAdminIp, listActiveAdminIps, purgeAdminIps, claim, complete, recentActions,
  countAppliedSince, hasActiveTemporary };
