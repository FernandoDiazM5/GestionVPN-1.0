// ============================================================
//  Rate limiting anti fuerza bruta (Fase 2)
//  Respaldado por la tabla auth_attempts (persiste reinicios).
//  Regla: tras MAX_FAILS fallos en WINDOW_MS desde una IP → bloqueo.
// ============================================================
const crypto = require('crypto');
const { query } = require('../db/mysql');
const bucketRepo = require('../db/repos/authRateBucketRepo');
const metrics = require('./metrics');
const log = require('./logger').child({ scope: 'auth-rate-limit' });

const MAX_FAILS = Number(process.env.RL_MAX_FAILS) || 5;
const WINDOW_MS = Number(process.env.RL_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const OTP_SEND_MAX = Number(process.env.RL_OTP_SEND_MAX) || 5;
const OTP_SEND_WINDOW_MS = Number(process.env.RL_OTP_SEND_WINDOW_MS) || 60 * 60 * 1000;
const OTP_SEND_COOLDOWN_MS = Number(process.env.RL_OTP_SEND_COOLDOWN_MS) || 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

const POLICIES = Object.freeze({
  LOGIN: { windowMs: FIFTEEN_MINUTES, blockMs: FIFTEEN_MINUTES, ip: 20, identity: 5, pair: 5 },
  SETUP: { windowMs: ONE_HOUR, blockMs: ONE_HOUR, ip: 3 },
  REGISTER: { windowMs: ONE_HOUR, blockMs: ONE_HOUR, ip: 5, identity: 3, pair: 3, cooldownMs: 60_000 },
  OTP_VERIFY: { windowMs: FIFTEEN_MINUTES, blockMs: FIFTEEN_MINUTES, ip: 10, identity: 5, pair: 5 },
  OTP_SEND: { windowMs: ONE_HOUR, blockMs: ONE_HOUR, ip: 5, identity: 5, pair: 5, cooldownMs: 60_000 },
  RESET_REQUEST: { windowMs: ONE_HOUR, blockMs: ONE_HOUR, ip: 5, identity: 5, pair: 5 },
  RESET_CONFIRM: { windowMs: FIFTEEN_MINUTES, blockMs: FIFTEEN_MINUTES, ip: 10 },
  // El token todavia no es confiable en esta etapa: limitar solo por IP.
  FEDERATED_EXCHANGE: { windowMs: FIFTEEN_MINUTES, blockMs: FIFTEEN_MINUTES, ip: 20 },
});

function rateHmacKey() {
  const configured = String(process.env.AUTH_RATE_HMAC_KEY || '');
  const placeholder = /^<.*>$/.test(configured);
  if (!placeholder && Buffer.byteLength(configured, 'utf8') >= 32) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_RATE_HMAC_KEY debe contener al menos 32 bytes en producción');
  }
  return 'development-only-auth-rate-hmac-key';
}

function assertRateLimitConfig() {
  rateHmacKey();
}

function bucketHash(scope, value) {
  return crypto.createHmac('sha256', rateHmacKey())
    .update(`${scope}:${String(value).trim().toLowerCase()}`)
    .digest('hex');
}

function identityFromRequest(req, field) {
  const raw = req.body?.[field];
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function guardPolicy(flow, { identityField = 'email' } = {}) {
  const policy = POLICIES[flow];
  if (!policy) throw new TypeError(`Política de rate limit desconocida: ${flow}`);

  return async (req, res, next) => {
    try {
      const ip = clientIp(req);
      const identity = policy.identity ? identityFromRequest(req, identityField) : '';
      const dimensions = [
        { kind: `${flow}_IP`, hash: bucketHash('ip', ip), limit: policy.ip, resetOnSuccess: false },
      ];
      if (identity) {
        dimensions.push(
          { kind: `${flow}_ID`, hash: bucketHash('identity', identity), limit: policy.identity, resetOnSuccess: true },
          { kind: `${flow}_PAIR`, hash: bucketHash('pair', `${ip}\0${identity}`), limit: policy.pair, resetOnSuccess: true }
        );
        if (policy.cooldownMs) {
          dimensions.push({
            kind: `${flow}_COOLDOWN`,
            hash: bucketHash('cooldown', identity),
            limit: 1,
            windowMs: policy.cooldownMs,
            blockMs: policy.cooldownMs,
            resetOnSuccess: false,
          });
        }
      }

      const consumed = [];
      for (const dimension of dimensions) {
        const status = await bucketRepo.consume({
          bucketHash: dimension.hash,
          kind: dimension.kind,
          limit: dimension.limit,
          windowMs: dimension.windowMs || policy.windowMs,
          blockMs: dimension.blockMs || policy.blockMs,
        });
        metrics.authRateLimitTotal.inc({
          kind: dimension.kind,
          result: status.allowed ? 'allowed' : 'blocked',
        });
        consumed.push({ ...dimension, status });
        if (!status.allowed) {
          const retryAfter = Math.max(1, Math.ceil(status.retryAfterMs / 1000));
          res.set('Retry-After', String(retryAfter));
          return res.status(429).json({
            success: false,
            code: 'RATE_LIMITED',
            message: 'Demasiados intentos. Inténtalo nuevamente más tarde.',
          });
        }
      }

      req._clientIp = ip;
      req._authRateBuckets = consumed;
      next();
    } catch (error) { next(error); }
  };
}

async function clearSuccessfulIdentity(req) {
  const resettable = (req._authRateBuckets || []).filter((bucket) => bucket.resetOnSuccess);
  await Promise.all(resettable.map((bucket) => bucketRepo.clear(bucket.hash, bucket.kind)));
}

let cleanupTimer = null;
function startBucketCleanup({ intervalMs = ONE_HOUR, retentionMs = 48 * ONE_HOUR } = {}) {
  if (cleanupTimer) return;
  const purge = () => bucketRepo.purgeStale(Date.now() - retentionMs)
    .catch((error) => log.warn({ err: error.message }, 'No se pudieron purgar buckets vencidos'));
  purge();
  cleanupTimer = setInterval(purge, intervalMs);
  cleanupTimer.unref?.();
}

function stopBucketCleanup() {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
}

/** Obtiene la IP efectiva ya validada por la política `trust proxy` de Express. */
function clientIp(req) {
  const rawIp = String(req.ip || req.socket?.remoteAddress || '').trim();
  const normalizedIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
  return normalizedIp.slice(0, 64) || 'unknown';
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

async function otpSendStatus(ip, email) {
  const rows = await query(
    `SELECT COUNT(*) AS sends, MAX(created_at) AS last_send
       FROM auth_attempts
      WHERE kind = 'OTP_SEND' AND success = 1
        AND (ip_address = ? OR email = ?) AND created_at >= ?`,
    [ip, email || null, Date.now() - OTP_SEND_WINDOW_MS]
  );
  const sends = Number(rows[0]?.sends || 0);
  const lastSend = Number(rows[0]?.last_send || 0);
  return {
    blocked: sends >= OTP_SEND_MAX || (lastSend > 0 && Date.now() - lastSend < OTP_SEND_COOLDOWN_MS),
    retryAfterMs: sends >= OTP_SEND_MAX
      ? OTP_SEND_WINDOW_MS
      : Math.max(0, OTP_SEND_COOLDOWN_MS - (Date.now() - lastSend)),
  };
}

function guardOtpSend() {
  return async (req, res, next) => {
    try {
      const ip = clientIp(req);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const status = await otpSendStatus(ip, email);
      if (status.blocked) {
        const retryAfter = Math.max(1, Math.ceil(status.retryAfterMs / 1000));
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          success: false,
          code: 'OTP_SEND_RATE_LIMITED',
          message: 'Espera antes de solicitar otro código.',
        });
      }
      req._clientIp = ip;
      next();
    } catch (e) { next(e); }
  };
}

module.exports = {
  clientIp, recordAttempt, isBlocked, guard, guardOtpSend, otpSendStatus,
  guardPolicy, clearSuccessfulIdentity, bucketHash, assertRateLimitConfig, POLICIES,
  startBucketCleanup, stopBucketCleanup,
  MAX_FAILS, WINDOW_MS, OTP_SEND_MAX, OTP_SEND_WINDOW_MS, OTP_SEND_COOLDOWN_MS,
};
