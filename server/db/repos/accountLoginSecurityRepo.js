const { query, withTransaction } = require('../mysql');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function normalize(row, now = Date.now()) {
  if (!row) return { locked: false, lockedUntil: null, failures15m: 0, failures24h: 0 };
  const lockedUntil = Number(row.locked_until || 0);
  return {
    locked: lockedUntil > now,
    lockedUntil: lockedUntil || null,
    lockReason: row.lock_reason || null,
    failures15m: Number(row.failures_15m || 0),
    failures24h: Number(row.failures_24h || 0),
  };
}

async function status(userId, now = Date.now()) {
  const rows = await query('SELECT * FROM account_login_security WHERE user_id = ? LIMIT 1', [userId]);
  return normalize(rows[0], now);
}

async function recordFailure({ userId, ip, now = Date.now() }) {
  return withTransaction(async (tx) => {
    await tx.query(`INSERT IGNORE INTO account_login_security
      (user_id,window_15m_started_at,window_24h_started_at,updated_at)
      VALUES (?,?,?,?)`, [userId, now, now, now]);
    const rows = await tx.query('SELECT * FROM account_login_security WHERE user_id = ? FOR UPDATE', [userId]);
    const row = rows[0];
    const reset15m = now - Number(row.window_15m_started_at || 0) >= FIFTEEN_MINUTES;
    const reset24h = now - Number(row.window_24h_started_at || 0) >= TWENTY_FOUR_HOURS;
    const start15m = reset15m ? now : Number(row.window_15m_started_at || now);
    const start24h = reset24h ? now : Number(row.window_24h_started_at || now);
    const failures15m = reset15m ? 1 : Number(row.failures_15m || 0) + 1;
    const failures24h = reset24h ? 1 : Number(row.failures_24h || 0) + 1;
    let lockedUntil = Number(row.locked_until || 0);
    let lockedAt = Number(row.locked_at || 0) || null;
    let lockReason = row.lock_reason || null;
    if (failures24h >= 10) {
      if (lockedUntil <= now) lockedAt = now;
      lockedUntil = Math.max(lockedUntil, now + TWENTY_FOUR_HOURS);
      lockReason = '10_FAILED_PASSWORDS_24H';
    } else if (failures15m >= 5) {
      if (lockedUntil <= now) lockedAt = now;
      lockedUntil = Math.max(lockedUntil, now + FIFTEEN_MINUTES);
      lockReason = '5_FAILED_PASSWORDS_15M';
    }
    await tx.query(`UPDATE account_login_security SET failures_15m=?,window_15m_started_at=?,
      failures_24h=?,window_24h_started_at=?,locked_until=?,locked_at=?,lock_reason=?,last_failure_at=?,
      last_failure_ip=?,updated_at=? WHERE user_id=?`,
      [failures15m, start15m, failures24h, start24h, lockedUntil || null, lockedAt, lockReason,
        now, String(ip || '').slice(0, 64) || null, now, userId]);
    return { locked: lockedUntil > now, lockedUntil: lockedUntil || null, lockReason,
      failures15m, failures24h };
  });
}

async function clearAfterSuccess(userId) {
  await query('DELETE FROM account_login_security WHERE user_id = ?', [userId]);
}

async function unlock(userId) {
  const result = await query(`UPDATE account_login_security SET failures_15m=0,window_15m_started_at=0,
    failures_24h=0,window_24h_started_at=0,locked_until=NULL,locked_at=NULL,lock_reason=NULL,updated_at=?
    WHERE user_id=?`, [Date.now(), userId]);
  return Number(result.affectedRows || 0) > 0;
}

async function get(userId) {
  const rows = await query('SELECT * FROM account_login_security WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

async function listLocked(now = Date.now(), workspaceId = null) {
  const params = [now];
  let sql = `SELECT s.user_id,u.email,u.name,s.failures_15m,s.failures_24h,s.locked_until,
      s.locked_at,s.lock_reason,s.last_failure_at,s.last_failure_ip,s.updated_at,w.name AS workspace_name
    FROM account_login_security s JOIN users u ON u.id=s.user_id AND u.deleted_at IS NULL
    LEFT JOIN workspace_members wm ON wm.user_id=u.id AND wm.deleted_at IS NULL
    LEFT JOIN workspaces w ON w.id=wm.workspace_id AND w.deleted_at IS NULL
    WHERE s.locked_until > ?`;
  if (workspaceId) { sql += ' AND wm.workspace_id=?'; params.push(workspaceId); }
  sql += ' ORDER BY s.locked_until DESC';
  return query(sql, params);
}

module.exports = { status, recordFailure, clearAfterSuccess, unlock, get, listLocked };
