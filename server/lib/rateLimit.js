// ============================================================
//  Rate limiting anti fuerza bruta (Fase 2)
//  Respaldado por la tabla auth_attempts (persiste reinicios).
//  Regla: tras MAX_FAILS fallos en WINDOW_MS desde una IP → bloqueo.
// ============================================================
const crypto = require('crypto');
const { query } = require('../db/mysql');

const MAX_FAILS = Number(process.env.RL_MAX_FAILS) || 5;
const WINDOW_MS = Number(process.env.RL_WINDOW_MS) || 15 * 60 * 1000; // 15 min

/** Obtiene la IP real del request (respeta proxy si está configurado). */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/** Registra un intento (éxito o fallo). kind ∈ 'LOGIN' | 'OTP'. */
async function recordAttempt(ip, kind, email, success) {
  await query(
    'INSERT INTO auth_attempts (id, ip_address, email, kind, success, created_at) VALUES (?,?,?,?,?,?)',
    [crypto.randomUUID(), ip, email || null, kind, success ? 1 : 0, Date.now()]
  );
}

/** ¿La IP está bloqueada para ese tipo de acción? */
async function isBlocked(ip, kind) {
  const since = Date.now() - WINDOW_MS;
  const rows = await query(
    'SELECT COUNT(*) AS fails FROM auth_attempts WHERE ip_address = ? AND kind = ? AND success = 0 AND created_at >= ?',
    [ip, kind, since]
  );
  return Number(rows[0]?.fails || 0) >= MAX_FAILS;
}

/**
 * Middleware factory: bloquea la IP si superó el límite para `kind`.
 * Responde 429 con minutos restantes aproximados.
 */
function guard(kind) {
  return async (req, res, next) => {
    try {
      const ip = clientIp(req);
      if (await isBlocked(ip, kind)) {
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMITED',
          message: `Demasiados intentos. Espera ${Math.ceil(WINDOW_MS / 60000)} minutos.`,
        });
      }
      req._clientIp = ip;
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { clientIp, recordAttempt, isBlocked, guard, MAX_FAILS, WINDOW_MS };
