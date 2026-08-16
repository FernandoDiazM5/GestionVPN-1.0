'use strict';

const crypto = require('crypto');
const { digest, hashPassword, verifyPassword, verifyTotp, decryptSecret,
  recoveryCodeDigest, generateRecoveryCodes } = require('../domain/adminSecurity');

const SESSION_MS = 8 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_BLOCK_MS = 30 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 10;

function coded(code) { const error = new Error(code); error.code = code; return error; }
function sourceDigest(ip, pepper) { return crypto.createHmac('sha256', pepper).update(String(ip || '')).digest('hex'); }

async function recordLoginAttempt(connection, bucket, timestamp) {
  const [rows] = await connection.query('SELECT window_started_at,attempts,blocked_until FROM admin_login_rate_buckets WHERE bucket_digest=? FOR UPDATE', [bucket]);
  const record = rows[0];
  if (record?.blocked_until && new Date(record.blocked_until) > timestamp) {
    const error = coded('ADMIN_LOGIN_RATE_LIMITED');
    error.retryAfterSeconds = Math.ceil((new Date(record.blocked_until) - timestamp) / 1000);
    throw error;
  }
  if (!record) {
    await connection.query('INSERT INTO admin_login_rate_buckets (bucket_digest,window_started_at,attempts) VALUES (?,?,1)', [bucket, timestamp]);
    return;
  }
  const expired = timestamp - new Date(record.window_started_at) >= RATE_WINDOW_MS;
  const attempts = expired ? 1 : Number(record.attempts) + 1;
  const blockedUntil = attempts > RATE_MAX_ATTEMPTS ? new Date(timestamp.getTime() + RATE_BLOCK_MS) : null;
  await connection.query('UPDATE admin_login_rate_buckets SET window_started_at=?,attempts=?,blocked_until=? WHERE bucket_digest=?',
    [expired ? timestamp : record.window_started_at, attempts, blockedUntil, bucket]);
  if (blockedUntil) {
    const error = coded('ADMIN_LOGIN_RATE_LIMITED'); error.retryAfterSeconds = RATE_BLOCK_MS / 1000; throw error;
  }
}

function createAdminSessionService({ pool, mfaEncryptionKey, sessionPepper, now = () => new Date() }) {
  async function login({ email, password, totp, recoveryCode, sourceIp, userAgent }) {
    const timestamp = now();
    const bucket = sourceDigest(sourceIp, sessionPepper);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      try { await recordLoginAttempt(connection, bucket, timestamp); } catch (error) {
        await connection.commit(); throw error;
      }
      const [rows] = await connection.query(
        `SELECT id,email,display_name,password_hash,totp_secret_encrypted,status,failed_login_count,locked_until
           FROM control_plane_admins WHERE email=? FOR UPDATE`, [email.toLowerCase()],
      );
      const admin = rows[0];
      const locked = admin?.locked_until && new Date(admin.locked_until) > timestamp;
      const passwordValid = admin ? await verifyPassword(password, admin.password_hash)
        : Boolean(await hashPassword(password, Buffer.alloc(16))) && false;
      let totpValid = false;
      let recoveryId = null;
      if (passwordValid && !locked && admin.status === 'ACTIVE') {
        if (totp) {
          const secret = decryptSecret(admin.totp_secret_encrypted, mfaEncryptionKey);
          totpValid = verifyTotp(secret, totp, timestamp);
        } else if (recoveryCode) {
          const [recoveryRows] = await connection.query(
            'SELECT id FROM control_plane_admin_recovery_codes WHERE admin_id=? AND code_digest=? AND consumed_at IS NULL FOR UPDATE',
            [admin.id, recoveryCodeDigest(recoveryCode, sessionPepper)],
          );
          recoveryId = recoveryRows[0]?.id || null;
        }
      }
      if (!admin || locked || admin.status !== 'ACTIVE' || !passwordValid || (!totpValid && !recoveryId)) {
        if (admin && !locked) {
          const failures = Number(admin.failed_login_count) + 1;
          await connection.query(
            'UPDATE control_plane_admins SET failed_login_count=?,locked_until=? WHERE id=?',
            [failures >= MAX_FAILURES ? 0 : failures, failures >= MAX_FAILURES ? new Date(timestamp.getTime() + LOCK_MS) : null, admin.id],
          );
        }
        await connection.commit();
        throw coded('ADMIN_LOGIN_FAILED');
      }
      const token = crypto.randomBytes(32).toString('base64url');
      const csrf = crypto.randomBytes(32).toString('base64url');
      const id = crypto.randomUUID();
      const expiresAt = new Date(timestamp.getTime() + SESSION_MS);
      const idleExpiresAt = new Date(timestamp.getTime() + IDLE_MS);
      if (recoveryId) {
        const [consumed] = await connection.query(
          'UPDATE control_plane_admin_recovery_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL', [timestamp, recoveryId],
        );
        if (consumed.affectedRows !== 1) throw coded('ADMIN_LOGIN_FAILED');
      }
      await connection.query(
        `INSERT INTO control_plane_admin_sessions
          (id,admin_id,token_digest,csrf_digest,source_ip_digest,user_agent_hash,expires_at,idle_expires_at,last_seen_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, admin.id, digest(token), digest(csrf), sourceDigest(sourceIp, sessionPepper), digest(userAgent), expiresAt, idleExpiresAt, timestamp, timestamp],
      );
      await connection.query('UPDATE control_plane_admins SET failed_login_count=0,locked_until=NULL,last_login_at=? WHERE id=?', [timestamp, admin.id]);
      await connection.query('DELETE FROM admin_login_rate_buckets WHERE bucket_digest=?', [bucket]);
      await connection.commit();
      return { token, csrf, expiresAt, admin: { id: admin.id, email: admin.email, displayName: admin.display_name } };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function logout(sessionId) {
    await pool.query('UPDATE control_plane_admin_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL', [now(), sessionId]);
  }

  async function refreshCsrf(sessionId) {
    const csrf = crypto.randomBytes(32).toString('base64url');
    const [result] = await pool.query(
      'UPDATE control_plane_admin_sessions SET csrf_digest=? WHERE id=? AND revoked_at IS NULL',
      [digest(csrf), sessionId],
    );
    if (result.affectedRows !== 1) throw coded('ADMIN_AUTH_REQUIRED');
    return csrf;
  }

  async function regenerateRecoveryCodes(adminId, { password, totp }) {
    const timestamp = now();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT password_hash,totp_secret_encrypted,status FROM control_plane_admins
          WHERE id=? FOR UPDATE`, [adminId],
      );
      const admin = rows[0];
      const passwordValid = admin && await verifyPassword(password, admin.password_hash);
      const totpValid = passwordValid && admin.status === 'ACTIVE'
        && verifyTotp(decryptSecret(admin.totp_secret_encrypted, mfaEncryptionKey), totp, timestamp);
      if (!totpValid) throw coded('ADMIN_REAUTH_FAILED');
      const codes = generateRecoveryCodes();
      await connection.query('DELETE FROM control_plane_admin_recovery_codes WHERE admin_id=?', [adminId]);
      for (const code of codes) await connection.query(
        'INSERT INTO control_plane_admin_recovery_codes (id,admin_id,code_digest,created_at) VALUES (?,?,?,?)',
        [crypto.randomUUID(), adminId, recoveryCodeDigest(code, sessionPepper), timestamp],
      );
      await connection.commit();
      return codes;
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  return { login, logout, refreshCsrf, regenerateRecoveryCodes };
}

module.exports = { createAdminSessionService, SESSION_MS, IDLE_MS, RATE_MAX_ATTEMPTS };
