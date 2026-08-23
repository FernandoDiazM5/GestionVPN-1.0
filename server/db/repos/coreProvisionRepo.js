const crypto = require('crypto');
const { query } = require('../mysql');

function safeSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map(step => ({
    name: String(step?.name || '').slice(0, 190),
    status: ['CREATED', 'EXISTS', 'FAILED'].includes(step?.status) ? step.status : 'FAILED',
  }));
}

async function start({ actorUserId, targetHost, targetIdentity, targetVersion, targetModel, networkSupernet }) {
  const id = crypto.randomUUID();
  await query(`INSERT INTO core_provision_runs
    (id,operation_type,status,actor_user_id,target_host,target_identity,target_version,target_model,
     network_supernet,steps_json,started_at)
    VALUES (?,'PREPARE_NEW','RUNNING',?,?,?,?,?,?,?,?)`, [id, actorUserId || null,
    targetHost || null, targetIdentity || null, targetVersion || null, targetModel || null,
    networkSupernet || null, JSON.stringify([]), Date.now()]);
  return id;
}

async function finish(id, { status, steps, errorCode = null, errorMessage = null, identity = null }) {
  await query(`UPDATE core_provision_runs SET status=?,steps_json=?,error_code=?,error_message=?,
    target_identity=COALESCE(?,target_identity),finished_at=? WHERE id=?`, [status,
    JSON.stringify(safeSteps(steps)), errorCode, errorMessage ? String(errorMessage).slice(0, 500) : null,
    identity, Date.now(), id]);
}

async function history(limit = 20) {
  const rows = await query(`SELECT r.*,u.email AS actor_email FROM core_provision_runs r
    LEFT JOIN users u ON u.id=r.actor_user_id ORDER BY r.started_at DESC LIMIT ?`,
  [Math.min(50, Math.max(1, Number(limit) || 20))]);
  return rows.map(row => ({ ...row, steps: (() => {
    try { return safeSteps(JSON.parse(row.steps_json || '[]')); } catch (_) { return []; }
  })(), steps_json: undefined }));
}

module.exports = { start, finish, history, safeSteps };
