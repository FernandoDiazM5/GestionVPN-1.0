const crypto = require('crypto');
const { query } = require('../mysql');

async function record(event) {
  await query(`INSERT INTO web_security_events
    (id,event_type,source_ip,identity_hash,user_id,route_group,method,status_code,detail,decision,occurred_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), event.eventType, event.sourceIp,
    event.identityHash || null, event.userId || null, event.routeGroup || null,
    event.method || null, event.statusCode || null,
    event.detail ? JSON.stringify(event.detail) : null, event.decision || 'OBSERVE_ONLY',
    event.occurredAt || Date.now()]);
}

async function listRecent({ since, sourceIp = null, limit = 5000 }) {
  const params = [since];
  let sql = `SELECT event_type,source_ip,identity_hash,user_id,route_group,method,status_code,
      detail,decision,action_id,decided_at,occurred_at FROM web_security_events WHERE occurred_at>=?`;
  if (sourceIp) { sql += ' AND source_ip=?'; params.push(sourceIp); }
  sql += ' ORDER BY occurred_at DESC LIMIT ?';
  params.push(Number(limit));
  return query(sql, params);
}

async function markDecision({ sourceIp, eventType, since, decision, actionId, decidedAt = Date.now() }) {
  const result = await query(`UPDATE web_security_events SET decision=?,action_id=?,decided_at=?
    WHERE source_ip=? AND event_type=? AND occurred_at>=?`,
  [decision, actionId, decidedAt, sourceIp, eventType, since]);
  return Number(result.affectedRows || 0);
}

async function purgeOlderThan(cutoffMs) {
  const result = await query('DELETE FROM web_security_events WHERE occurred_at < ?', [cutoffMs]);
  return Number(result.affectedRows || 0);
}

module.exports = { record, listRecent, markDecision, purgeOlderThan };
