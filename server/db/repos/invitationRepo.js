// ============================================================
//  Repositorio de invitaciones (MySQL) — Fase 3
//  OTP guardado como HASH; estados PENDING/ACCEPTED/EXPIRED/REVOKED.
// ============================================================
const { query } = require('../mysql');

async function create({ id, workspaceId, email, otpHash, role, invitedBy, expiresAt }) {
  const now = Date.now();
  await query(
    `INSERT INTO invitations
       (id, workspace_id, email, otp_hash, role, status, invited_by, attempts, expires_at, created_at)
     VALUES (?,?,?,?,?, 'PENDING', ?, 0, ?, ?)`,
    [id, workspaceId, email, otpHash, role, invitedBy, expiresAt, now]
  );
}

/** Última invitación PENDING para un email (en cualquier workspace). */
async function findPendingByEmail(email) {
  const rows = await query(
    `SELECT * FROM invitations
      WHERE email = ? AND status = 'PENDING'
      ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/** Invitación PENDING existente para email+workspace (evita duplicados). */
async function findPending(workspaceId, email) {
  const rows = await query(
    `SELECT * FROM invitations
      WHERE workspace_id = ? AND email = ? AND status = 'PENDING' LIMIT 1`,
    [workspaceId, email]
  );
  return rows[0] || null;
}

async function incAttempts(id) {
  await query('UPDATE invitations SET attempts = attempts + 1 WHERE id = ?', [id]);
}

async function markAccepted(tx, id) {
  await tx.query("UPDATE invitations SET status = 'ACCEPTED' WHERE id = ?", [id]);
}

async function revoke(id, workspaceId) {
  const r = await query(
    "UPDATE invitations SET status = 'REVOKED' WHERE id = ? AND workspace_id = ? AND status = 'PENDING'",
    [id, workspaceId]
  );
  return r.affectedRows > 0;
}

async function listPending(workspaceId) {
  return query(
    `SELECT id, email, role, attempts, expires_at, created_at
       FROM invitations
      WHERE workspace_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC`,
    [workspaceId]
  );
}

module.exports = { create, findPendingByEmail, findPending, incAttempts, markAccepted, revoke, listPending };
