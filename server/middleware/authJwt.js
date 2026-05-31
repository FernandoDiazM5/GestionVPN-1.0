// ============================================================
//  Middleware de sesión multi-tenant (Fase 2)
//  Lee la cookie HttpOnly 'vpn_session' y expone req.account.
//  requireRole(...) aplica RBAC por rol de workspace.
// ============================================================
const { COOKIE_NAME, verifySession } = require('../lib/jwt');
const { sendError } = require('../lib/apiResponse');

/** Exige sesión válida. Setea req.account = { sub, email, workspace_id, role }. */
function requireSession(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return sendError(res, 401, 'No autenticado', 'NO_SESSION');
  try {
    req.account = verifySession(token);
    next();
  } catch (_) {
    return sendError(res, 401, 'Sesión expirada', 'SESSION_EXPIRED');
  }
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

module.exports = { requireSession, requireRole };
