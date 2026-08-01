const crypto = require('crypto');
const { query } = require('../mysql');

async function record(event) {
  await query(`INSERT INTO web_security_events
    (id,event_type,source_ip,identity_hash,user_id,route_group,method,status_code,detail,occurred_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), event.eventType, event.sourceIp,
    event.identityHash || null, event.userId || null, event.routeGroup || null,
    event.method || null, event.statusCode || null,
    event.detail ? JSON.stringify(event.detail) : null, event.occurredAt || Date.now()]);
}

async function listRecent({ since, sourceIp = null, limit = 5000 }) {
  const params = [since];
  let sql = `SELECT event_type,source_ip,identity_hash,user_id,route_group,method,status_code,
      detail,occurred_at FROM web_security_events WHERE occurred_at>=?`;
  if (sourceIp) { sql += ' AND source_ip=?'; params.push(sourceIp); }
  sql += ' ORDER BY occurred_at DESC LIMIT ?';
  params.push(Number(limit));
  return query(sql, params);
}

async function purgeOlderThan(cutoffMs) {
  const result = await query('DELETE FROM web_security_events WHERE occurred_at < ?', [cutoffMs]);
  return Number(result.affectedRows || 0);
}

module.exports = { record, listRecent, purgeOlderThan };
