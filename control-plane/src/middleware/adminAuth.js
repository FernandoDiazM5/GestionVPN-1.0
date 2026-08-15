'use strict';

const crypto = require('crypto');
const { digest } = require('../domain/adminSecurity');
const { IDLE_MS } = require('../services/adminSessions');

const COOKIE_NAME = '__Host-joinpoint_admin';
function parseCookie(header) {
  return String(header || '').split(';').map(item => item.trim().split('=')).find(([name]) => name === COOKIE_NAME)?.[1] || '';
}
function sameDigest(left, right) {
  const a = Buffer.from(String(left || ''), 'hex'); const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function createAdminAuth({ pool, now = () => new Date() }) {
  return async (req, res, next) => {
    try {
      const timestamp = now();
      const token = parseCookie(req.headers.cookie);
      if (!token) return res.status(401).json({ success: false, code: 'ADMIN_AUTH_REQUIRED' });
      const [rows] = await pool.query(
        `SELECT s.id,s.admin_id,s.csrf_digest,s.user_agent_hash,s.expires_at,s.idle_expires_at,a.email,a.display_name
           FROM control_plane_admin_sessions s JOIN control_plane_admins a ON a.id=s.admin_id AND a.status='ACTIVE'
          WHERE s.token_digest=? AND s.revoked_at IS NULL LIMIT 1`, [digest(token)],
      );
      const session = rows[0];
      if (!session || session.user_agent_hash !== digest(req.get('user-agent') || '')
        || new Date(session.expires_at) <= timestamp || new Date(session.idle_expires_at) <= timestamp) {
        return res.status(401).json({ success: false, code: 'ADMIN_AUTH_REQUIRED' });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameDigest(digest(req.headers['x-csrf-token']), session.csrf_digest)) {
        return res.status(403).json({ success: false, code: 'CSRF_REQUIRED' });
      }
      req.admin = { id: session.admin_id, email: session.email, displayName: session.display_name };
      req.adminSessionId = session.id;
      const idleExpiresAt = new Date(Math.min(new Date(session.expires_at).getTime(), timestamp.getTime() + IDLE_MS));
      await pool.query('UPDATE control_plane_admin_sessions SET last_seen_at=?,idle_expires_at=? WHERE id=?', [timestamp, idleExpiresAt, session.id]);
      return next();
    } catch (error) { return next(error); }
  };
}

module.exports = { COOKIE_NAME, createAdminAuth };
