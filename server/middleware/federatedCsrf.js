const crypto = require('crypto');
const { isAllowedOrigin } = require('../lib/originPolicy');
const { sendError } = require('../lib/apiResponse');

const COOKIE_NAME = 'vpn_federated_csrf';
const HEADER_NAME = 'x-csrf-token';
const MAX_AGE_MS = 10 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/account/federated',
  };
}

function sameValue(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueFederatedCsrf(res) {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
  return token;
}

function clearFederatedCsrf(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

function requireFederatedCsrf(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return sendError(res, 403, 'Origen requerido', 'ORIGIN_REQUIRED');
  if (!isAllowedOrigin(origin)) return sendError(res, 403, 'Origen no permitido', 'ORIGIN_FORBIDDEN');
  if (!sameValue(req.cookies?.[COOKIE_NAME], req.get(HEADER_NAME))) {
    return sendError(res, 403, 'Token CSRF inválido', 'CSRF_INVALID');
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  issueFederatedCsrf,
  clearFederatedCsrf,
  requireFederatedCsrf,
};
