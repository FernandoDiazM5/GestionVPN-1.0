// ============================================================
//  JWT multi-tenant (Fase 2) — reutiliza el MISMO secreto que
//  el sistema de auth existente (.jwt_secret) para una sola clave.
//
//  Payload: { sub: userId, email, workspace_id, role }
//  Entrega: cookie HttpOnly 'vpn_session' (anti-XSS).
// ============================================================
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../auth.middleware');

const COOKIE_NAME = 'vpn_session';
const EXPIRES_IN = process.env.JWT_EXPIRES || '8h';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h

function signSession(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

function verifySession(token) {
  return jwt.verify(token, JWT_SECRET);
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

/** Setea la cookie HttpOnly de sesión. */
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieBaseOptions(), maxAge: MAX_AGE_MS });
}

/** Limpia la cookie de sesión (mismos atributos que el set para que efectivamente borre). */
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieBaseOptions());
}

module.exports = { COOKIE_NAME, signSession, verifySession, setSessionCookie, clearSessionCookie };
