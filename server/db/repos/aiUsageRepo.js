const { query, withTransaction } = require('../mysql');

function usageDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ || 'America/Lima' }).format(now);
}

async function get(scopeKey, runQuery = query, now = new Date()) {
  const rows = await runQuery(
    'SELECT request_count, input_tokens, output_tokens, total_tokens, failed_count FROM ai_usage_daily WHERE usage_date = ? AND scope_key = ?',
    [usageDate(now), scopeKey]
  );
  return rows[0] || { request_count: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, failed_count: 0 };
}

async function reserve({ workspaceId, globalLimit, workspaceLimit, globalTokenLimit }, transaction = withTransaction) {
  return transaction(async (tx) => {
    const date = usageDate();
    const scopes = ['__GLOBAL__', `workspace:${workspaceId}`];
    for (const scope of scopes) {
      await tx.query(
        `INSERT IGNORE INTO ai_usage_daily
          (usage_date, scope_key, request_count, input_tokens, output_tokens, total_tokens, failed_count, updated_at)
         VALUES (?, ?, 0, 0, 0, 0, 0, ?)`,
        [date, scope, Date.now()]
      );
    }
    const globalRows = await tx.query(
      'SELECT request_count, total_tokens FROM ai_usage_daily WHERE usage_date = ? AND scope_key = ? FOR UPDATE',
      [date, scopes[0]]
    );
    const workspaceRows = await tx.query(
      'SELECT request_count FROM ai_usage_daily WHERE usage_date = ? AND scope_key = ? FOR UPDATE',
      [date, scopes[1]]
    );
    const globalRequestLimitReached = Number(globalRows[0]?.request_count || 0) >= globalLimit;
    const workspaceRequestLimitReached = Number(workspaceRows[0]?.request_count || 0) >= workspaceLimit;
    const tokenLimitReached = Number(globalRows[0]?.total_tokens || 0) >= globalTokenLimit;
    if (globalRequestLimitReached || workspaceRequestLimitReached || tokenLimitReached) return false;
    await tx.query(
      'UPDATE ai_usage_daily SET request_count = request_count + 1, updated_at = ? WHERE usage_date = ? AND scope_key IN (?, ?)',
      [Date.now(), date, scopes[0], scopes[1]]
    );
    return true;
  });
}

async function recordResult({ workspaceId, inputTokens = 0, outputTokens = 0, totalTokens = 0, failed = false }, runQuery = query) {
  const date = usageDate();
  await runQuery(
    `UPDATE ai_usage_daily SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?,
       total_tokens = total_tokens + ?, failed_count = failed_count + ?, updated_at = ?
     WHERE usage_date = ? AND scope_key IN (?, ?)`,
    [inputTokens, outputTokens, totalTokens, failed ? 1 : 0, Date.now(), date, '__GLOBAL__', `workspace:${workspaceId}`]
  );
}

module.exports = { usageDate, get, reserve, recordResult };
