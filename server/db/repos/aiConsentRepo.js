const { query } = require('../mysql');

async function get(userId, policyVersion, runQuery = query) {
  const rows = await runQuery(
    'SELECT accepted_at, revoked_at FROM ai_user_consents WHERE user_id = ? AND policy_version = ? LIMIT 1',
    [userId, policyVersion]
  );
  return !!rows[0]?.accepted_at && !rows[0]?.revoked_at;
}

async function set({ userId, policyVersion, accepted }, runQuery = query) {
  const now = Date.now();
  await runQuery(
    `INSERT INTO ai_user_consents (user_id, policy_version, accepted_at, revoked_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE accepted_at = VALUES(accepted_at),
       revoked_at = VALUES(revoked_at), updated_at = VALUES(updated_at)`,
    [userId, policyVersion, accepted ? now : null, accepted ? null : now, now]
  );
  return accepted;
}

module.exports = { get, set };
