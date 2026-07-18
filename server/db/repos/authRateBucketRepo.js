const { query, withTransaction } = require('../mysql');

function assertBucketInput({ bucketHash, kind, limit, windowMs, blockMs }) {
  if (!/^[a-f0-9]{64}$/.test(bucketHash)) throw new TypeError('bucketHash inválido');
  if (!/^[A-Z0-9_]{1,32}$/.test(kind)) throw new TypeError('kind inválido');
  for (const [name, value] of Object.entries({ limit, windowMs, blockMs })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} inválido`);
  }
}

/**
 * Reserva un intento dentro de un bucket persistente.
 *
 * INSERT IGNORE resuelve la carrera de creación; SELECT ... FOR UPDATE serializa
 * los incrementos posteriores incluso cuando existen varias instancias Node.
 */
async function consume({ bucketHash, kind, limit, windowMs, blockMs, now = Date.now() }) {
  assertBucketInput({ bucketHash, kind, limit, windowMs, blockMs });

  return withTransaction(async (tx) => {
    await tx.query(
      `INSERT IGNORE INTO auth_rate_buckets
         (bucket_hash, kind, count, window_started_at, blocked_until, updated_at)
       VALUES (?, ?, 0, ?, 0, ?)`,
      [bucketHash, kind, now, now]
    );

    const rows = await tx.query(
      `SELECT count, window_started_at, blocked_until
         FROM auth_rate_buckets
        WHERE bucket_hash = ? AND kind = ?
        FOR UPDATE`,
      [bucketHash, kind]
    );
    const row = rows[0];
    if (!row) throw new Error('No se pudo crear el bucket de rate limit');

    const existingBlock = Number(row.blocked_until || 0);
    if (existingBlock > now) {
      await tx.query(
        'UPDATE auth_rate_buckets SET updated_at = ? WHERE bucket_hash = ? AND kind = ?',
        [now, bucketHash, kind]
      );
      return { allowed: false, count: Number(row.count), retryAfterMs: existingBlock - now };
    }

    const previousWindow = Number(row.window_started_at);
    const expired = now - previousWindow >= windowMs;
    const windowStartedAt = expired ? now : previousWindow;
    const nextCount = (expired ? 0 : Number(row.count)) + 1;
    const blockedUntil = nextCount > limit ? now + blockMs : 0;

    await tx.query(
      `UPDATE auth_rate_buckets
          SET count = ?, window_started_at = ?, blocked_until = ?, updated_at = ?
        WHERE bucket_hash = ? AND kind = ?`,
      [nextCount, windowStartedAt, blockedUntil, now, bucketHash, kind]
    );

    return {
      allowed: blockedUntil === 0,
      count: nextCount,
      retryAfterMs: blockedUntil ? blockMs : 0,
    };
  });
}

async function clear(bucketHash, kind) {
  if (!/^[a-f0-9]{64}$/.test(bucketHash)) throw new TypeError('bucketHash inválido');
  if (!/^[A-Z0-9_]{1,32}$/.test(kind)) throw new TypeError('kind inválido');
  return withTransaction((tx) => tx.query(
    'DELETE FROM auth_rate_buckets WHERE bucket_hash = ? AND kind = ?',
    [bucketHash, kind]
  ));
}

async function purgeStale(updatedBefore, limit = 10_000) {
  if (!Number.isSafeInteger(updatedBefore) || updatedBefore <= 0) throw new TypeError('updatedBefore inválido');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new TypeError('limit inválido');
  return query('DELETE FROM auth_rate_buckets WHERE updated_at < ? LIMIT ?', [updatedBefore, limit]);
}

module.exports = { consume, clear, purgeStale };
