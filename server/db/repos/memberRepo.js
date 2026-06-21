// ============================================================
//  Repositorio de membresías de workspace (MySQL) — Fase 3
//  RBAC: OWNER (único moderador) / MEMBER. Respeta soft-deletes.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

async function findMembership(workspaceId, userId) {
  const rows = await query(
    'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
    [workspaceId, userId]
  );
  return rows[0] || null;
}

/** Alta de miembro (acepta tx opcional para usar en transacción). */
async function add(runner, { workspaceId, userId, role, invitedBy }) {
  const q = runner && runner.query ? runner.query.bind(runner) : query;
  await q(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, invited_by, created_at)
     VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), workspaceId, userId, role, invitedBy || null, Date.now()]
  );
}

async function listMembers(workspaceId) {
  const rows = await query(
    `SELECT u.id AS user_id, u.email, u.name, u.disabled_at, wm.role, wm.created_at AS joined_at
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ? AND wm.deleted_at IS NULL AND u.deleted_at IS NULL
      ORDER BY FIELD(wm.role,'OWNER','MEMBER'), wm.created_at ASC`,
    [workspaceId]
  );
  return rows.map(r => ({ ...r, disabled: !!r.disabled_at }));
}

async function softRemove(workspaceId, userId) {
  const r = await query(
    "UPDATE workspace_members SET deleted_at = ? WHERE workspace_id = ? AND user_id = ? AND deleted_at IS NULL AND role <> 'OWNER'",
    [Date.now(), workspaceId, userId]
  );
  return r.affectedRows > 0;
}

module.exports = { findMembership, add, listMembers, softRemove };
