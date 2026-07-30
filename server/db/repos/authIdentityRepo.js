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
            wm.workspace_id, wm.role, w.name AS workspace_name, w.slug AS workspace_slug
       FROM auth_identities ai
       JOIN users u ON u.id = ai.user_id
       JOIN workspace_members wm
         ON wm.user_id = u.id AND wm.deleted_at IS NULL
       JOIN workspaces w
         ON w.id = wm.workspace_id AND w.deleted_at IS NULL
      WHERE ai.provider = ? AND ai.tenant_key = ? AND ai.provider_subject = ?
        AND ai.disabled_at IS NULL
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
      WHERE provider = ? AND tenant_key = ? AND provider_subject = ?
        AND disabled_at IS NULL`,
    [now, now, provider, tenantKey, subject],
  );
  return Number(result.affectedRows || 0) === 1;
}

async function findByUser({ userId, provider, tenantKey = '' }) {
  const rows = await query(
    `SELECT id, user_id, provider, tenant_key, provider_subject, email_at_link,
            created_at, updated_at, last_verified_at, disabled_at
       FROM auth_identities
      WHERE user_id = ? AND provider = ? AND tenant_key = ?
      LIMIT 1`,
    [userId, provider, tenantKey],
  );
  return rows[0] || null;
}

async function findBySubject({ provider, tenantKey = '', subject }) {
  const rows = await query(
    `SELECT id, user_id, provider, tenant_key, provider_subject, email_at_link,
            created_at, updated_at, last_verified_at, disabled_at
       FROM auth_identities
      WHERE provider = ? AND tenant_key = ? AND provider_subject = ?
      LIMIT 1`,
    [provider, tenantKey, subject],
  );
  return rows[0] || null;
}

async function setDisabled({ id, disabledAt }) {
  const now = Date.now();
  const result = await query(
    `UPDATE auth_identities
        SET disabled_at = ?, updated_at = ?
      WHERE id = ?`,
    [disabledAt, now, id],
  );
  return Number(result.affectedRows || 0) === 1;
}

async function reactivate({ id, emailAtLink }) {
  const now = Date.now();
  const result = await query(
    `UPDATE auth_identities
        SET disabled_at = NULL, email_at_link = ?, updated_at = ?
      WHERE id = ?`,
    [emailAtLink, now, id],
  );
  return Number(result.affectedRows || 0) === 1;
}

module.exports = {
  link,
  findLoginContext,
  markVerified,
  findByUser,
  findBySubject,
  setDisabled,
  reactivate,
};
