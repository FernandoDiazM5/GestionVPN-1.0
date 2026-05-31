// ============================================================
//  Puente de sesión (unificación de login) — Fase 4
//  Convierte un usuario legacy (SQLite, username) en un usuario
//  multi-tenant (MySQL) + su workspace, y devuelve el JWT de sesión.
//  Reutilizado por /api/account/bridge y por /api/auth/login|setup
//  para que un único login establezca la sesión RBAC en toda la app.
// ============================================================
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { withTransaction } = require('../db/mysql');
const { signSession } = require('./jwt');
const userRepo = require('../db/repos/userRepo');
const workspaceRepo = require('../db/repos/workspaceRepo');

/**
 * Garantiza usuario + workspace en MySQL para un usuario legacy y
 * devuelve { token, user } con la sesión multi-tenant.
 * @param {string} username  username del login legacy
 */
async function buildSessionForLegacyUser(username) {
  const email = `${String(username).toLowerCase()}@local.app`;
  let user = await userRepo.findByEmail(email);

  if (!user) {
    const id = crypto.randomUUID();
    const now = Date.now();
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO users (id, email, password_hash, name, email_verified, created_at, updated_at)
         VALUES (?,?,?,?,1,?,?)`,
        [id, email, await bcrypt.hash(crypto.randomUUID(), 10), username, now, now]
      );
      await workspaceRepo.createForOwner(tx, { ownerId: id, name: `Espacio de ${username}` });
    });
    user = await userRepo.findByEmail(email);
  }

  let membership = await workspaceRepo.findMembershipByUser(user.id);
  if (!membership) {
    await withTransaction(async (tx) => {
      await workspaceRepo.createForOwner(tx, { ownerId: user.id, name: `Espacio de ${username}` });
    });
    membership = await workspaceRepo.findMembershipByUser(user.id);
  }

  const token = signSession({
    sub: user.id, email: user.email, workspace_id: membership.workspace_id, role: membership.role,
  });
  return {
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      role: membership.role, workspace_id: membership.workspace_id,
    },
  };
}

module.exports = { buildSessionForLegacyUser };
