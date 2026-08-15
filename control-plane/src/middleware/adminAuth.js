'use strict';

const crypto = require('crypto');

function tokenDigest(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest();
}

function createAdminAuth(expectedToken) {
  if (Buffer.byteLength(String(expectedToken || '')) < 32) throw new Error('ADMIN_TOKEN_TOO_SHORT');
  const expected = tokenDigest(expectedToken);
  return (req, res, next) => {
    const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
    const actual = tokenDigest(match?.[1] || '');
    if (!match || !crypto.timingSafeEqual(actual, expected)) {
      return res.status(401).json({ success: false, code: 'ADMIN_AUTH_REQUIRED' });
    }
    return next();
  };
}

module.exports = { createAdminAuth };
