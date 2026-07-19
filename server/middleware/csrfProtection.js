const crypto = require('crypto');
const {
  COOKIE_NAME,
  CSRF_COOKIE_NAME,
  csrfTokenForSessionToken,
} = require('../lib/jwt');
const { isAllowedOrigin } = require('../lib/originPolicy');
const { sendError } = require('../lib/apiResponse');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_MUTATIONS = [
  /^\/api\/auth\/(?:login|setup|password-reset\/request|password-reset\/confirm)\/?$/,
  /^\/api\/account\/(?:login|register|verify|resend)\/?$/,
  // Tiene un bootstrap CSRF dedicado, separado de la cookie de sesion local.
  /^\/api\/account\/federated\/exchange\/?$/,
  /^\/api\/team\/accept\/?$/,
  /^\/api\/error-reports\/?$/,
];

function sameValue(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isPublicMutation(pathname) {
  return PUBLIC_MUTATIONS.some(pattern => pattern.test(pathname));
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return sendError(res, 403, 'Origen no permitido', 'ORIGIN_FORBIDDEN');
  }

  const pathname = (req.originalUrl || req.url || '').split('?')[0];
  if (isPublicMutation(pathname)) return next();

  const sessionToken = req.cookies?.[COOKIE_NAME];
  if (!sessionToken) return next();
  if (!origin) return sendError(res, 403, 'Origen requerido', 'ORIGIN_REQUIRED');

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get('x-csrf-token');
  if (!sameValue(cookieToken, headerToken)) {
    return sendError(res, 403, 'Token CSRF inválido', 'CSRF_INVALID');
  }

  try {
    const expected = csrfTokenForSessionToken(sessionToken);
    if (!sameValue(expected, headerToken)) {
      return sendError(res, 403, 'Token CSRF inválido', 'CSRF_INVALID');
    }
  } catch (_) {
    return sendError(res, 403, 'Token CSRF inválido', 'CSRF_INVALID');
  }

  next();
}

module.exports = { csrfProtection, isPublicMutation };
