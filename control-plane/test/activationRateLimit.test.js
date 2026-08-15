'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bucketDigest, recordActivationAttempt } = require('../src/services/activationRateLimit');

const pepper = 'rate-limit-pepper-joinpoint-separado-32-bytes';
function poolWith(row) {
  const state = { committed: false, rollback: false, write: null };
  const connection = {
    beginTransaction: async () => {},
    query: async (sql, params) => sql.startsWith('SELECT') ? [[row].filter(Boolean)] : (state.write = params, [{ affectedRows: 1 }]),
    commit: async () => { state.committed = true; }, rollback: async () => { state.rollback = true; }, release: () => {},
  };
  return { pool: { getConnection: async () => connection }, state };
}

test('seudonimiza la IP y permite intentos bajo el límite', async () => {
  assert.match(bucketDigest('203.0.113.5', pepper), /^[a-f0-9]{64}$/);
  const { pool, state } = poolWith(null);
  const result = await recordActivationAttempt({ pool, sourceIp: '203.0.113.5', pepper, now: new Date('2026-08-15T00:00:00Z') });
  assert.deepEqual(result, { allowed: true, remaining: 4 });
  assert.equal(state.committed, true);
});

test('persiste el bloqueo al superar el límite y entrega retry-after', async () => {
  const { pool, state } = poolWith({ window_started_at: new Date('2026-08-15T00:00:00Z'), attempts: 5, blocked_until: null });
  await assert.rejects(
    recordActivationAttempt({ pool, sourceIp: '203.0.113.5', pepper, now: new Date('2026-08-15T00:01:00Z') }),
    error => error.code === 'ACTIVATION_RATE_LIMITED' && error.retryAfterSeconds === 3600,
  );
  assert.equal(state.committed, true);
  assert.ok(state.write[3] instanceof Date);
});
