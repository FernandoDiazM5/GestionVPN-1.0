const crypto = require('crypto');
const { query } = require('../mysql');

async function link({ userId, provider, tenantKey = '', subject, emailAtLink }) {
  const now = Date.now();
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO auth_identities
       (id, user_id, provider, tenant_key, provider_subject, email_at_link,
        created_at, updated_at, last_verified_at)
     VALUES (?,?,?,?,?,?,?,?,NULL)`,
    [id, userId, provider, tenantKey, subject, emailAtLink, now, now],
  );
  return id;
}

async function findLoginContext({ provider, tenantKey = '', subject }) {
  const rows = await query(
    `SELECT ai.user_id, ai.email_at_link,
            u.email, u.name, u.email_verified, u.disabled_at, u.deleted_at, u.is_platform_admin,
            wm.workspace_id, wm.role, w.name AS workspace_name
       FROM auth_identities ai
       JOIN users u ON u.id = ai.user_id
       JOIN workspace_members wm
         ON wm.user_id = u.id AND wm.deleted_at IS NULL
       JOIN workspaces w
         ON w.id = wm.workspace_id AND w.deleted_at IS NULL
      WHERE ai.provider = ? AND ai.tenant_key = ? AND ai.provider_subject = ?
      ORDER BY wm.created_at ASC
      LIMIT 1`,
    [provider, tenantKey, subject],
  );
  return rows[0] || null;
}

async function markVerified({ provider, tenantKey = '', subject }) {
  const now = Date.now();
  const result = await query(
    `UPDATE auth_identities
        SET last_verified_at = ?, updated_at = ?
      WHERE provider = ? AND tenant_key = ? AND provider_subject = ?`,
    [now, now, provider, tenantKey, subject],
  );
  return Number(result.affectedRows || 0) === 1;
}

module.exports = { link, findLoginContext, markVerified };
