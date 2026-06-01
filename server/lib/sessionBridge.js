// ============================================================
//  Puente de sesión (unificación de login) — Fase 4
//  Convierte un usuario legacy (vpn_users, username) en un usuario
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
// Usuario que opera la plataforma (Administrador / Sistemas). Configurable.
const PLATFORM_ADMIN_USERNAME = (process.env.PLATFORM_ADMIN_USERNAME || 'admin').toLowerCase();

async function buildSessionForLegacyUser(username) {
  const email = `${String(username).toLowerCase()}@local.app`;
  const isPlatformAdmin = String(username).toLowerCase() === PLATFORM_ADMIN_USERNAME;
  const { query } = require('../db/mysql');
  let user = await userRepo.findByEmail(email);

  if (!user) {
    const id = crypto.randomUUID();
    const now = Date.now();
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO users (id, email, password_hash, name, is_platform_admin, email_verified, created_at, updated_at)
         VALUES (?,?,?,?,?,1,?,?)`,
        [id, email, await bcrypt.hash(crypto.randomUUID(), 10), username, isPlatformAdmin ? 1 : 0, now, now]
      );
      await workspaceRepo.createForOwner(tx, { ownerId: id, name: `Espacio de ${username}` });
    });
    user = await userRepo.findByEmail(email);
  } else if (Number(user.is_platform_admin) !== (isPlatformAdmin ? 1 : 0)) {
    // Sincroniza el flag si cambió la designación
    await query('UPDATE users SET is_platform_admin = ? WHERE id = ?', [isPlatformAdmin ? 1 : 0, user.id]);
    user.is_platform_admin = isPlatformAdmin ? 1 : 0;
  }

  let membership = await workspaceRepo.findMembershipByUser(user.id);
  if (!membership) {
    await withTransaction(async (tx) => {
      await workspaceRepo.createForOwner(tx, { ownerId: user.id, name: `Espacio de ${username}` });
    });
    membership = await workspaceRepo.findMembershipByUser(user.id);
  }

  const platform_admin = Number(user.is_platform_admin) === 1;
  const token = signSession({
    sub: user.id, email: user.email, workspace_id: membership.workspace_id,
    role: membership.role, platform_admin,
  });
  return {
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      role: membership.role, workspace_id: membership.workspace_id, platform_admin,
    },
  };
}

/**
 * Autentica un usuario multi-tenant (MySQL) por email + contraseña.
 * Devuelve { token, user } si las credenciales son válidas, o null.
 * Permite que Moderadores/Miembros inicien sesión en la app.
 */
async function authenticateMysqlUser(login, password) {
  // Acepta: email directo · username corto (<username>@local.app) ·
  // o el `name` del usuario (lo que el Administrador ve como "usuario").
  const raw = String(login || '').trim().toLowerCase();
  if (!raw) return null;
  const email = raw.includes('@') ? raw : `${raw}@local.app`;
  let user = await userRepo.findByEmail(email);
  if (!user && !raw.includes('@')) {
    // Fallback: login por nombre (ej. moderador "user123" con email real)
    user = await userRepo.findByName(raw);
  }
  if (!user || !user.password_hash) return null;
  if (user.disabled_at) return null;   // moderador suspendido → login bloqueado
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  let membership = await workspaceRepo.findMembershipByUser(user.id);
  if (!membership) {
    await withTransaction(async (tx) => {
      await workspaceRepo.createForOwner(tx, { ownerId: user.id, name: `Espacio de ${user.name || email}` });
    });
    membership = await workspaceRepo.findMembershipByUser(user.id);
  }

  const platform_admin = Number(user.is_platform_admin) === 1;
  const token = signSession({
    sub: user.id, email: user.email, workspace_id: membership.workspace_id,
    role: membership.role, platform_admin,
  });
  return {
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      role: membership.role, workspace_id: membership.workspace_id, platform_admin,
    },
  };
}

module.exports = { buildSessionForLegacyUser, authenticateMysqlUser };
