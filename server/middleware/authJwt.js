// ============================================================
//  Middleware de sesión multi-tenant (Fase 2)
//  Lee la cookie HttpOnly 'vpn_session' y expone req.account.
//  requireRole(...) aplica RBAC por rol de workspace.
// ============================================================
const { COOKIE_NAME, verifySession, clearSessionCookie } = require('../lib/jwt');
const { sendError } = require('../lib/apiResponse');
const { getAccountStatus, invalidateAccountStatus } = require('../lib/accountStatus');
const log = require('../lib/logger').child({ scope: 'auth' });

/** Invalida el cache de un user (llamar al borrarlo). */
function invalidateUserCache(userId) {
  invalidateAccountStatus(userId);
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
    const status = await getAccountStatus(account.sub);
    if (status !== 'active') {
      try { clearSessionCookie(res); } catch (_) { /* noop */ }
      return status === 'suspended'
        ? sendError(res, 401, 'Tu cuenta fue suspendida por el Administrador', 'ACCOUNT_SUSPENDED')
        : sendError(res, 401, 'Tu cuenta fue eliminada', 'USER_DELETED');
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
