const { COOKIE_NAME, verifySession, clearSessionCookie } = require('../lib/jwt');
const { sendError } = require('../lib/apiResponse');
const authSessionRepo = require('../db/repos/authSessionRepo');
const { getAppSetting, decryptPass } = require('../db.service');
const log = require('../lib/logger').child({ scope: 'auth' });
const metrics = require('../lib/metrics');

async function invalidateUserCache(userId) {
  if (!userId) return 0;
  return authSessionRepo.revokeAll(userId);
}

function rejectSession(res, message, code) {
  try { clearSessionCookie(res); } catch (_) { /* noop */ }
  metrics.authFailsTotal.inc({ reason: code.toLowerCase() });
  return sendError(res, 401, message, code, { logout: true });
}

async function resolveSession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    metrics.authFailsTotal.inc({ reason: 'no_session' });
    sendError(res, 401, 'No autenticado', 'NO_SESSION', { logout: true });
    return null;
  }

  let account;
  try {
    account = verifySession(token);
  } catch (_) {
    rejectSession(res, 'Sesión expirada', 'SESSION_EXPIRED');
    return null;
  }

  if (!account?.sub || !account?.workspace_id || !account?.role || !account?.jti) {
    rejectSession(res, 'Sesión inválida', 'SESSION_REVOKED');
    return null;
  }

  let state;
  try {
    state = await authSessionRepo.findState({
      jti: account.jti,
      userId: account.sub,
      workspaceId: account.workspace_id,
    });
  } catch (error) {
    log.error({ code: error?.code || 'UNKNOWN' }, 'No se pudo comprobar el estado de sesión');
    metrics.authFailsTotal.inc({ reason: 'auth_state_unavailable' });
    sendError(res, 503, 'No se pudo comprobar el estado de la sesión', 'AUTH_STATE_UNAVAILABLE');
    return null;
  }

  const now = Date.now();
  if (!state || state.revoked_at || Number(state.expires_at) <= now) {
    rejectSession(res, 'La sesión fue revocada', 'SESSION_REVOKED');
    return null;
  }
  if (state.deleted_at) {
    rejectSession(res, 'Tu cuenta fue eliminada', 'USER_DELETED');
    return null;
  }
  if (state.disabled_at) {
    rejectSession(res, 'Tu cuenta fue suspendida por el Administrador', 'ACCOUNT_SUSPENDED');
    return null;
  }

  const isPlatformAdmin = Number(state.is_platform_admin) === 1;
  if (Boolean(account.platform_admin) !== isPlatformAdmin) {
    rejectSession(res, 'La sesión fue revocada', 'SESSION_REVOKED');
    return null;
  }
  if (!isPlatformAdmin && (!state.workspace_exists || !state.membership_role)) {
    rejectSession(res, 'La sesión fue revocada', 'SESSION_REVOKED');
    return null;
  }

  req.account = {
    ...account,
    email: state.email || account.email,
    role: isPlatformAdmin ? account.role : state.membership_role,
    platform_admin: isPlatformAdmin,
  };
  return req.account;
}

async function requireSession(req, res, next) {
  const account = await resolveSession(req, res);
  if (account) next();
}

async function injectMikrotik(req) {
  const mtIp = await getAppSetting('MT_IP');
  const mtUser = await getAppSetting('MT_USER');
  const mtPassData = await getAppSetting('MT_PASS');
  req.mikrotik = (mtIp && mtUser && mtPassData)
    ? { ip: mtIp, user: mtUser, pass: decryptPass(mtPassData) }
    : null;
}

async function requireSessionWithMikrotik(req, res, next) {
  const account = await resolveSession(req, res);
  if (!account) return;
  try {
    await injectMikrotik(req);
  } catch (error) {
    log.error({ code: error?.code || 'UNKNOWN' }, 'No se pudo cargar la configuración del router');
    return sendError(res, 503, 'No se pudo cargar la configuración del router', 'ROUTER_CONFIG_UNAVAILABLE');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.account) return sendError(res, 401, 'No autenticado', 'NO_SESSION');
    if (!roles.includes(req.account.role)) {
      return sendError(res, 403, 'Permisos insuficientes', 'FORBIDDEN');
    }
    next();
  };
}

function requirePlatformAdmin(req, res, next) {
  if (!req.account) return sendError(res, 401, 'No autenticado', 'NO_SESSION');
  if (!req.account.platform_admin) return sendError(res, 403, 'Solo el Administrador', 'NOT_PLATFORM_ADMIN');
  next();
}

module.exports = {
  resolveSession,
  requireSession,
  requireSessionWithMikrotik,
  requireRole,
  requirePlatformAdmin,
  invalidateUserCache,
};
