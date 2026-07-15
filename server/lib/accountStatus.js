const { query } = require('../db/mysql');

const CACHE_TTL_MS = 10 * 1000;
const cache = new Map();

async function getAccountStatus(userId) {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.status;
  const rows = await query(
    'SELECT disabled_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  const status = !rows.length ? 'deleted' : rows[0].disabled_at ? 'suspended' : 'active';
  cache.set(userId, { status, expiresAt: now + CACHE_TTL_MS });
  return status;
}

function invalidateAccountStatus(userId) {
  if (userId) cache.delete(userId);
}

module.exports = { getAccountStatus, invalidateAccountStatus };
