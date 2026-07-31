const crypto = require('crypto');
const { query } = require('../mysql');

async function createStepUp({ tokenHash, userId, sessionJti, method, expiresAt }) {
  const now = Date.now();
  await query('DELETE FROM platform_security_stepups WHERE expires_at < ?', [now]);
  await query(`INSERT INTO platform_security_stepups
    (token_hash,user_id,session_jti,method,expires_at,created_at) VALUES (?,?,?,?,?,?)`,
  [tokenHash, userId, sessionJti, method, expiresAt, now]);
}
async function consumeStepUp({ tokenHash, userId, sessionJti }) {
  const result = await query(`DELETE FROM platform_security_stepups
    WHERE token_hash=? AND user_id=? AND session_jti=? AND expires_at>?`,
  [tokenHash, userId, sessionJti, Date.now()]);
  return Number(result.affectedRows || 0) === 1;
}
async function audit(entry) {
  await query(`INSERT INTO platform_security_audit
    (id,actor_user_id,action,target,jail,category,reason,outcome,detail,request_ip,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), entry.actorUserId, entry.action,
    entry.target || null, entry.jail || null, entry.category, entry.reason, entry.outcome,
    entry.detail ? JSON.stringify(entry.detail) : null, entry.requestIp || null, Date.now()]);
}
async function history({ target = null, limit = 100 }) {
  const params = [];
  let sql = `SELECT a.*, u.email AS actor_email FROM platform_security_audit a
    LEFT JOIN users u ON u.id=a.actor_user_id`;
  if (target) { sql += ' WHERE a.target=?'; params.push(target); }
  sql += ' ORDER BY a.created_at DESC LIMIT ?'; params.push(Number(limit));
  return query(sql, params);
}
async function trustAdd({ target, category, reason, actorUserId }) {
  await query(`INSERT INTO platform_security_trusted (target,category,reason,actor_user_id,created_at)
    VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE category=VALUES(category),reason=VALUES(reason),
    actor_user_id=VALUES(actor_user_id),created_at=VALUES(created_at)`,
  [target, category, reason, actorUserId, Date.now()]);
}
async function trustRemove(target) { await query('DELETE FROM platform_security_trusted WHERE target=?', [target]); }
async function trustList() { return query(`SELECT t.*,u.email AS actor_email FROM platform_security_trusted t
  LEFT JOIN users u ON u.id=t.actor_user_id ORDER BY t.created_at DESC`); }
async function purgeOlderThan(cutoffMs) {
  const result = await query('DELETE FROM platform_security_audit WHERE created_at < ?', [cutoffMs]);
  return Number(result.affectedRows || 0);
}

module.exports = { createStepUp, consumeStepUp, audit, history, trustAdd, trustRemove, trustList, purgeOlderThan };
