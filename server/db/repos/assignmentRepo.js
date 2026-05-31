// ============================================================
//  Repositorio de asignación de túneles (Roles v2 — Fase C)
//  Qué túneles puede ver/usar cada miembro (View) de un workspace.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

/** Asigna un túnel a un usuario. Acepta tx opcional. Idempotente. */
async function add(runner, { workspaceId, tunnelId, userId, assignedBy }) {
  const q = runner && runner.query ? runner.query.bind(runner) : query;
  await q(
    `INSERT IGNORE INTO tunnel_assignments (id, workspace_id, tunnel_id, user_id, assigned_by, created_at)
     VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), workspaceId, tunnelId, userId, assignedBy || null, Date.now()]
  );
}

/** Asignaciones de un usuario (con joins mínimos). */
async function listByUser(workspaceId, userId) {
  return query(
    `SELECT id, tunnel_id, created_at FROM tunnel_assignments
      WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC`,
    [workspaceId, userId]
  );
}

/** Todas las asignaciones del workspace (con email del miembro). */
async function listForWorkspace(workspaceId) {
  return query(
    `SELECT ta.id, ta.tunnel_id, ta.user_id, ta.created_at, u.email AS user_email, u.name AS user_name
       FROM tunnel_assignments ta JOIN users u ON u.id = ta.user_id
      WHERE ta.workspace_id = ? ORDER BY ta.created_at DESC`,
    [workspaceId]
  );
}

/** IDs de túnel asignados a un usuario (para filtrar /nodes). */
async function assignedTunnelIds(workspaceId, userId) {
  const rows = await query(
    'SELECT tunnel_id FROM tunnel_assignments WHERE workspace_id = ? AND user_id = ?',
    [workspaceId, userId]
  );
  return rows.map(r => r.tunnel_id);
}

async function remove(id, workspaceId) {
  const r = await query('DELETE FROM tunnel_assignments WHERE id = ? AND workspace_id = ?', [id, workspaceId]);
  return r.affectedRows > 0;
}

module.exports = { add, listByUser, listForWorkspace, assignedTunnelIds, remove };
