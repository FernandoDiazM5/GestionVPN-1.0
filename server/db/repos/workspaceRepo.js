// ============================================================
//  Repositorio de workspaces y membresías (MySQL) — Fase 2/3
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');
const scanIpRepo = require('./scanIpRepo');
const log = require('../../lib/logger').child({ scope: 'workspace-repo' });

/**
 * Crea workspace + membresía OWNER dentro de una transacción (ACID).
 * @param {object} tx  objeto { query } de withTransaction
 * @returns {Promise<{workspaceId: string}>}
 */
async function createForOwner(tx, { ownerId, name }) {
  const now = Date.now();
  const workspaceId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  await tx.query(
    'INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES (?,?,?,?,?)',
    [workspaceId, name, ownerId, now, now]
  );
  await tx.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, invited_by, created_at)
     VALUES (?,?,?,'OWNER',NULL,?)`,
    [memberId, workspaceId, ownerId, now]
  );

  // Opción C: la scan-IP del VPS queda amarrada al workspace DESDE su creación,
  // de forma atómica (misma tx). Así el escaneo / Monitor AP del moderador
  // funciona sin un `scan:assign` manual posterior. Best-effort: si el pool está
  // agotado, NO se rompe la creación del workspace (el escaneo caería a legacy y
  // el admin puede ampliar/liberar el pool luego). El INSERT que falla hace
  // rollback solo de su statement (InnoDB), la tx del workspace sigue viva.
  try {
    const scanIp = await scanIpRepo.allocateInTx(tx, workspaceId);
    log.info({ workspaceId, scanIp }, 'scan-IP amarrada al crear workspace');
  } catch (e) {
    log.warn({ workspaceId, err: e?.message }, 'no se pudo amarrar scan-IP al crear workspace (escaneo caerá a legacy)');
  }

  return { workspaceId };
}

/** Membresía activa de un usuario (primer workspace). */
async function findMembershipByUser(userId) {
  const rows = await query(
    `SELECT wm.workspace_id, wm.role, w.name AS workspace_name
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ? AND wm.deleted_at IS NULL AND w.deleted_at IS NULL
      ORDER BY wm.created_at ASC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/** Workspace por id (no devuelve los borrados). */
async function findById(workspaceId) {
  const rows = await query(
    'SELECT id, name FROM workspaces WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [workspaceId]
  );
  return rows[0] || null;
}

module.exports = { createForOwner, findMembershipByUser, findById };
