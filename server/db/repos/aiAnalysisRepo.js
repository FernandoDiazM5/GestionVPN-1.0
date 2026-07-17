const crypto = require('node:crypto');
const { query, withTransaction } = require('../mysql');

function parseJson(value) {
  if (value == null || typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

async function findCached({ workspaceId, type, hash, promptVersion, now = Date.now() }, runQuery = query) {
  const rows = await runQuery(
    `SELECT uuid, summary_json, model, input_tokens, output_tokens, total_tokens, created_at
       FROM ai_analysis_runs
      WHERE workspace_id = ? AND analysis_type = ? AND snapshot_hash = ?
        AND prompt_version = ? AND status = 'SUCCEEDED' AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, type, hash, promptVersion, now]
  );
  if (!rows.length) return null;
  return { ...rows[0], summary_json: parseJson(rows[0].summary_json) };
}

async function createPending({ workspaceId, userId, type, hash, promptVersion, model, scope, ttlMs }, runQuery = query) {
  const uuid = crypto.randomUUID();
  const now = Date.now();
  const result = await runQuery(
    `INSERT INTO ai_analysis_runs
      (uuid, workspace_id, user_id, analysis_type, snapshot_hash, prompt_version, model,
       status, scope_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    [uuid, workspaceId, userId, type, hash, promptVersion, model, JSON.stringify(scope || {}), now, now + ttlMs]
  );
  return { id: result.insertId, uuid, created_at: now };
}

async function succeed(id, { analysis, usage, latencyMs }, runQuery = query) {
  await runQuery(
    `UPDATE ai_analysis_runs SET status = 'SUCCEEDED', summary_json = ?,
       input_tokens = ?, output_tokens = ?, total_tokens = ?, latency_ms = ? WHERE id = ?`,
    [JSON.stringify(analysis), usage.inputTokens || 0, usage.outputTokens || 0, usage.totalTokens || 0, latencyMs || 0, id]
  );
}

async function fail(id, { code, latencyMs }, runQuery = query) {
  await runQuery(
    `UPDATE ai_analysis_runs SET status = 'FAILED', error_code = ?, latency_ms = ? WHERE id = ?`,
    [code, latencyMs || 0, id]
  );
}

async function listForUser({
  workspaceId, userId, type, deviceFingerprint, createdAfter, limit = 20,
}, runQuery = query) {
  const params = [workspaceId, userId];
  let typeSql = '';
  if (type) { typeSql = ' AND r.analysis_type = ?'; params.push(type); }
  let deviceSql = '';
  if (deviceFingerprint) {
    deviceSql = ` AND (
      JSON_UNQUOTE(JSON_EXTRACT(r.scope_json, '$.deviceId')) = ?
      OR EXISTS (
        SELECT 1 FROM ai_air_os_snapshots s
         WHERE s.analysis_run_id = r.id AND s.device_fingerprint = ?
      )
    )`;
    params.push(deviceFingerprint, deviceFingerprint);
  }
  let createdSql = '';
  if (createdAfter) { createdSql = ' AND r.created_at >= ?'; params.push(createdAfter); }
  params.push(Math.min(50, Math.max(1, Number(limit) || 20)));
  const rows = await runQuery(
    `SELECT r.uuid, r.analysis_type, r.status, r.summary_json, r.model,
            r.total_tokens, r.created_at
       FROM ai_analysis_runs r
      WHERE r.workspace_id = ? AND r.user_id = ?${typeSql}${deviceSql}${createdSql}
      ORDER BY r.created_at DESC LIMIT ?`, params
  );
  return rows.map(row => ({
    uuid: row.uuid,
    type: row.analysis_type,
    status: row.status,
    analysis: parseJson(row.summary_json),
    model: row.model,
    totalTokens: Number(row.total_tokens || 0),
    createdAt: Number(row.created_at),
  }));
}

async function getForUser({ workspaceId, userId, uuid, createdAfter }, runQuery = query) {
  const params = [uuid, workspaceId, userId];
  const createdSql = createdAfter ? ' AND created_at >= ?' : '';
  if (createdAfter) params.push(createdAfter);
  const rows = await runQuery(
    `SELECT uuid, analysis_type, status, summary_json, scope_json, model,
            input_tokens, output_tokens, total_tokens, created_at
       FROM ai_analysis_runs WHERE uuid = ? AND workspace_id = ? AND user_id = ?${createdSql} LIMIT 1`,
    params
  );
  const row = rows[0];
  return row ? {
    uuid: row.uuid,
    type: row.analysis_type,
    status: row.status,
    analysis: parseJson(row.summary_json),
    scope: parseJson(row.scope_json),
    model: row.model,
    usage: {
      inputTokens: Number(row.input_tokens || 0),
      outputTokens: Number(row.output_tokens || 0),
      totalTokens: Number(row.total_tokens || 0),
    },
    createdAt: Number(row.created_at),
  } : null;
}

async function removeForUser({ workspaceId, userId, uuid }, transaction = withTransaction) {
  return transaction(async (tx) => {
    const rows = await tx.query(
      'SELECT id FROM ai_analysis_runs WHERE uuid = ? AND workspace_id = ? AND user_id = ? FOR UPDATE',
      [uuid, workspaceId, userId]
    );
    if (!rows.length) return false;
    await tx.query('DELETE FROM ai_air_os_snapshots WHERE analysis_run_id = ?', [rows[0].id]);
    await tx.query('DELETE FROM ai_analysis_runs WHERE id = ?', [rows[0].id]);
    return true;
  });
}

async function purgeOlderThan(cutoffMs, runQuery = query) {
  const result = await runQuery(
    `DELETE FROM ai_analysis_runs
      WHERE created_at < ? AND status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REJECTED')`,
    [cutoffMs]
  );
  return Number(result.affectedRows || 0);
}

module.exports = { findCached, createPending, succeed, fail, listForUser, getForUser, removeForUser, purgeOlderThan };
