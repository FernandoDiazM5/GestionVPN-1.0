'use strict';

const crypto = require('crypto');
const { digest, hashPassword, verifyPassword, verifyTotp, decryptSecret } = require('../domain/adminSecurity');

const SESSION_MS = 8 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function coded(code) { const error = new Error(code); error.code = code; return error; }
function sourceDigest(ip, pepper) { return crypto.createHmac('sha256', pepper).update(String(ip || '')).digest('hex'); }

function createAdminSessionService({ pool, mfaEncryptionKey, sessionPepper, now = () => new Date() }) {
  async function login({ email, password, totp, sourceIp, userAgent }) {
    const timestamp = now();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT id,email,display_name,password_hash,totp_secret_encrypted,status,failed_login_count,locked_until
           FROM control_plane_admins WHERE email=? FOR UPDATE`, [email.toLowerCase()],
      );
      const admin = rows[0];
      const locked = admin?.locked_until && new Date(admin.locked_until) > timestamp;
      const passwordValid = admin ? await verifyPassword(password, admin.password_hash)
        : Boolean(await hashPassword(password, Buffer.alloc(16))) && false;
      let totpValid = false;
      if (passwordValid && !locked && admin.status === 'ACTIVE') {
        const secret = decryptSecret(admin.totp_secret_encrypted, mfaEncryptionKey);
        totpValid = verifyTotp(secret, totp, timestamp);
      }
      if (!admin || locked || admin.status !== 'ACTIVE' || !passwordValid || !totpValid) {
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
      await connection.query(
        `INSERT INTO control_plane_admin_sessions
          (id,admin_id,token_digest,csrf_digest,source_ip_digest,user_agent_hash,expires_at,idle_expires_at,last_seen_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, admin.id, digest(token), digest(csrf), sourceDigest(sourceIp, sessionPepper), digest(userAgent), expiresAt, idleExpiresAt, timestamp, timestamp],
      );
      await connection.query('UPDATE control_plane_admins SET failed_login_count=0,locked_until=NULL,last_login_at=? WHERE id=?', [timestamp, admin.id]);
      await connection.commit();
      return { token, csrf, expiresAt, admin: { id: admin.id, email: admin.email, displayName: admin.display_name } };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function logout(sessionId) {
    await pool.query('UPDATE control_plane_admin_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL', [now(), sessionId]);
  }

  return { login, logout };
}

module.exports = { createAdminSessionService, SESSION_MS, IDLE_MS };
