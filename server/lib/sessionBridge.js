// ============================================================
//  Puente de sesión (unificación de login) — Fase 4
//  Convierte un usuario legacy (vpn_users, username) en un usuario
//  multi-tenant (MySQL) + su workspace, y devuelve el JWT de sesión.
//  Reutilizado por /api/account/bridge y por /api/auth/login|setup
//  para que un único login establezca la sesión RBAC en toda la app.
// ============================================================
const crypto = require('crypto');
const { withTransaction } = require('../db/mysql');
const { hashPassword, verifyAndUpgrade } = require('./passwordHasher');
const { issueSession } = require('./sessionService');
const userRepo = require('../db/repos/userRepo');
const workspaceRepo = require('../db/repos/workspaceRepo');
const metrics = require('./metrics');
const accountSecurity = require('../db/repos/accountLoginSecurityRepo');
const webObservation = require('./webSecurityObservation');

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000';

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

  // El administrador puede cambiar su email de recuperacion desde Ajustes.
  // El login legacy debe reutilizar esa misma cuenta por su flag estable, no
  // recrear <username>@local.app y producir otro platform_admin/workspace.
  if (!user && isPlatformAdmin) {
    const platformAdmins = await query(
      'SELECT * FROM users WHERE is_platform_admin = 1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1'
    );
    user = platformAdmins[0] || null;
  }

  if (!user) {
    const id = crypto.randomUUID();
    const now = Date.now();
    await withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO users (id, email, password_hash, name, is_platform_admin, email_verified, created_at, updated_at)
         VALUES (?,?,?,?,?,1,?,?)`,
        [id, email, await hashPassword(crypto.randomUUID()), username, isPlatformAdmin ? 1 : 0, now, now]
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
  const { token } = await issueSession({
    sub: user.id, email: user.email, workspace_id: membership.workspace_id,
    role: membership.role, platform_admin,
  });
  return {
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      role: membership.role, workspace_id: membership.workspace_id,
      workspace_name: membership.workspace_name,
      workspace_slug: membership.workspace_slug,
      platform_admin,
    },
  };
}

/**
 * Autentica un usuario multi-tenant (MySQL) por email + contraseña.
 * Devuelve { token, user } si las credenciales son válidas, o null.
 * Permite que Moderadores/Miembros inicien sesión en la app.
 */
async function authenticateMysqlUser(login, password, {
  includeFailure = false, requestIp = '', routeGroup = '/api/account/login',
} = {}) {
  // Acepta: email directo · username corto (<username>@local.app) ·
  // o el `name` del usuario (lo que el Administrador ve como "usuario").
  const raw = String(login || '').trim().toLowerCase();
  if (!raw) return null;
  const email = raw.includes('@') ? raw : `${raw}@local.app`;
  const userByEmail = await userRepo.findByEmail(email);
  // Para usernames cortos hacemos siempre ambas consultas. Así encontrar
  // <username>@local.app no crea un atajo temporal frente al fallback name.
  const userByName = raw.includes('@') ? null : await userRepo.findByName(raw);
  const user = userByEmail || userByName;
  const verification = await verifyAndUpgrade(
    password,
    user?.password_hash,
    user ? (nextHash, currentHash) => userRepo.updatePasswordHashIfCurrent(user.id, nextHash, currentHash) : undefined
  );
  const membership = await workspaceRepo.findMembershipByUser(user?.id || DUMMY_USER_ID);
  const lock = user ? await accountSecurity.status(user.id) : { locked: false };
  const credentialFailure = !user ? 'UNKNOWN_IDENTITY' : !verification.valid ? 'KNOWN_IDENTITY' : null;

  let failureReason = null;
  if (!user) failureReason = 'not_found';
  else if (lock.locked) failureReason = 'locked';
  else if (!verification.valid) failureReason = 'bad_password';
  else if (!user.email_verified) failureReason = 'unverified';
  else if (user.disabled_at) failureReason = 'disabled';
  else if (!membership) failureReason = 'no_membership';
  if (failureReason) {
    if (credentialFailure) void webObservation.record({ eventType: 'AUTH_FAILURE', sourceIp: requestIp,
      identityHash: webObservation.identityHash(raw), userId: user?.id || null,
      routeGroup, method: 'POST', statusCode: 401,
      detail: { identityKind: credentialFailure } });
    let security = lock;
    if (failureReason === 'bad_password') {
      security = await accountSecurity.recordFailure({ userId: user.id, ip: requestIp });
      if (security.locked) failureReason = 'locked';
    }
    metrics.authFailsTotal.inc({ reason: failureReason });
    return includeFailure ? { denied: failureReason, lockedUntil: security.lockedUntil || null } : null;
  }

  await accountSecurity.clearAfterSuccess(user.id);

  const platform_admin = Number(user.is_platform_admin) === 1;
  const { token } = await issueSession({
    sub: user.id, email: user.email, workspace_id: membership.workspace_id,
    role: membership.role, platform_admin,
  });
  return {
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      role: membership.role, workspace_id: membership.workspace_id,
      workspace_name: membership.workspace_name,
      workspace_slug: membership.workspace_slug,
      platform_admin,
    },
  };
}

module.exports = { buildSessionForLegacyUser, authenticateMysqlUser };
