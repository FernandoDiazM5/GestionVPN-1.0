'use strict';

const crypto = require('crypto');
const { normalizePublicIp } = require('./consumeActivation');

function coded(code, retryAfterSeconds) {
  const error = new Error(code); error.code = code; error.retryAfterSeconds = retryAfterSeconds; return error;
}

function bucketDigest(sourceIp, pepper) {
  if (Buffer.byteLength(String(pepper || '')) < 32) throw new Error('RATE_LIMIT_PEPPER_TOO_SHORT');
  return crypto.createHmac('sha256', pepper).update(normalizePublicIp(sourceIp)).digest('hex');
}

async function recordActivationAttempt({ pool, sourceIp, pepper, now = new Date(), limit = 5, windowMinutes = 15, blockMinutes = 60 }) {
  const digest = bucketDigest(sourceIp, pepper);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT window_started_at, attempts, blocked_until FROM activation_rate_buckets WHERE bucket_digest=? FOR UPDATE', [digest]);
    const row = rows[0];
    if (row?.blocked_until && new Date(row.blocked_until) > now) {
      await connection.commit();
      throw coded('ACTIVATION_RATE_LIMITED', Math.ceil((new Date(row.blocked_until) - now) / 1000));
    }
    const windowMs = windowMinutes * 60000;
    const sameWindow = row && now - new Date(row.window_started_at) < windowMs;
    const attempts = sameWindow ? Number(row.attempts) + 1 : 1;
    const blockedUntil = attempts > limit ? new Date(now.getTime() + blockMinutes * 60000) : null;
    await connection.query(
      `INSERT INTO activation_rate_buckets (bucket_digest,window_started_at,attempts,blocked_until)
       VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE window_started_at=VALUES(window_started_at),attempts=VALUES(attempts),blocked_until=VALUES(blocked_until)`,
      [digest, sameWindow ? row.window_started_at : now, attempts, blockedUntil],
    );
    await connection.commit();
    if (blockedUntil) throw coded('ACTIVATION_RATE_LIMITED', blockMinutes * 60);
    return { allowed: true, remaining: Math.max(0, limit - attempts) };
  } catch (error) {
    if (error.code !== 'ACTIVATION_RATE_LIMITED') await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

module.exports = { bucketDigest, recordActivationAttempt };
