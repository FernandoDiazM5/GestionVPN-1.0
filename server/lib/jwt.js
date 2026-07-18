// ============================================================
//  JWT multi-tenant con keyring active/previous y `kid`.
//
//  Payload: { sub: userId, email, workspace_id, role }
//  Entrega: cookie HttpOnly 'vpn_session' (anti-XSS).
// ============================================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { active, verificationKeys } = require('./sessionKeys');

const COOKIE_NAME = 'vpn_session';
const CSRF_COOKIE_NAME = 'vpn_csrf';
const EXPIRES_IN = process.env.JWT_EXPIRES || '8h';
const ISSUER = 'gestionvpn-api';
const AUDIENCE = 'gestionvpn-web';

function signSession(payload) {
  const identity = { ...payload, jti: payload.jti || crypto.randomUUID() };
  return jwt.sign(identity, active.secret, {
    algorithm: 'HS256',
    expiresIn: EXPIRES_IN,
    issuer: ISSUER,
    audience: AUDIENCE,
    header: { kid: active.kid },
  });
}

function verifySession(token) {
  const header = jwt.decode(token, { complete: true })?.header || {};
  const keys = verificationKeys(header.kid);
  if (!keys.length) throw new jwt.JsonWebTokenError('kid desconocido');
  let lastError;
  for (const key of keys) {
    try {
      return jwt.verify(token, key.secret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new jwt.JsonWebTokenError('firma inválida');
}

function csrfTokenForSessionToken(token) {
  const decoded = verifySession(token);
  if (!decoded?.jti) throw new jwt.JsonWebTokenError('sesión sin jti');
  const kid = jwt.decode(token, { complete: true })?.header?.kid;
  const key = verificationKeys(kid)[0];
  if (!key) throw new jwt.JsonWebTokenError('kid desconocido');
  return crypto.createHmac('sha256', key.secret)
    .update(`csrf:${decoded.jti}`)
    .digest('base64url');
}

// Opciones base reutilizadas por setSessionCookie() y clearSessionCookie().
// IMPORTANTE: algunos navegadores requieren que clearCookie use los mismos
// atributos (sameSite/secure/path) que el setCookie original — si no, NO
// borran la cookie. Mantener ambas en una sola fuente de verdad.
function cookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

/** Setea la cookie HttpOnly de sesión. */
function setSessionCookie(res, token) {
  const decoded = jwt.decode(token);
  const maxAge = Math.max(0, Number(decoded?.exp || 0) * 1000 - Date.now());
  res.cookie(COOKIE_NAME, token, { ...cookieBaseOptions(), maxAge });
  res.cookie(CSRF_COOKIE_NAME, csrfTokenForSessionToken(token), { ...csrfCookieOptions(), maxAge });
}

/** Limpia la cookie de sesión (mismos atributos que el set para que efectivamente borre). */
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieBaseOptions());
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions());
}

module.exports = {
  COOKIE_NAME,
  CSRF_COOKIE_NAME,
  JWT_SECRET: active.secret,
  signSession,
  verifySession,
  csrfTokenForSessionToken,
  setSessionCookie,
  clearSessionCookie,
};
