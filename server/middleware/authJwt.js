// ============================================================
//  Middleware de sesión multi-tenant (Fase 2)
//  Lee la cookie HttpOnly 'vpn_session' y expone req.account.
//  requireRole(...) aplica RBAC por rol de workspace.
// ============================================================
const { COOKIE_NAME, verifySession, clearSessionCookie } = require('../lib/jwt');
const { sendError } = require('../lib/apiResponse');
const { query } = require('../db/mysql');
const log = require('../lib/logger').child({ scope: 'auth' });

// Cache LRU minimalista — evita golpear MySQL en CADA request. TTL corto: si
// el usuario es eliminado, el deslogueo tarda como máximo este intervalo.
const USER_CACHE_TTL_MS = 15 * 1000;
const userCache = new Map(); // user_id → { ok: boolean, expires: number }

async function userStillExists(userId) {
  const cached = userCache.get(userId);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.ok;
  const rows = await query(
    'SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  const ok = rows.length > 0;
  userCache.set(userId, { ok, expires: now + USER_CACHE_TTL_MS });
  return ok;
}

/** Invalida el cache de un user (llamar al borrarlo). */
function invalidateUserCache(userId) {
  if (userId) userCache.delete(userId);
}

/** Exige sesión válida. Setea req.account = { sub, email, workspace_id, role }. */
async function requireSession(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return sendError(res, 401, 'No autenticado', 'NO_SESSION');
  let account;
  try {
    account = verifySession(token);
  } catch (_) {
    return sendError(res, 401, 'Sesión expirada', 'SESSION_EXPIRED');
  }
  // El JWT es válido, pero ¿el usuario sigue existiendo?
  // platform_admin (sub='admin') no está en la tabla users — saltamos esa check.
  if (account.platform_admin) {
    req.account = account;
    return next();
  }
  try {
    if (!(await userStillExists(account.sub))) {
      try { clearSessionCookie(res); } catch (_) { /* noop */ }
      return sendError(res, 401, 'Tu cuenta fue eliminada', 'USER_DELETED');
    }
  } catch (e) {
    // Si MySQL falla acá, mejor dejar pasar (degradar) que tirar 500 a todas
    // las rutas autenticadas. El cache evita que esto pase con frecuencia.
    log.warn({ err: e.message, userId: account.sub }, 'No se pudo verificar existencia del user (degradando)');
  }
  req.account = account;
  next();
}

/** RBAC: exige que el rol del usuario esté entre los permitidos. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.account) return sendError(res, 401, 'No autenticado', 'NO_SESSION');
    if (!roles.includes(req.account.role)) {
      return sendError(res, 403, 'Permisos insuficientes', 'FORBIDDEN');
    }
    next();
  };
}

/** Exige Administrador de plataforma (Sistemas). */
function requirePlatformAdmin(req, res, next) {
  if (!req.account) return sendError(res, 401, 'No autenticado', 'NO_SESSION');
  if (!req.account.platform_admin) return sendError(res, 403, 'Solo el Administrador', 'NOT_PLATFORM_ADMIN');
  next();
}

module.exports = { requireSession, requireRole, requirePlatformAdmin, invalidateUserCache };
