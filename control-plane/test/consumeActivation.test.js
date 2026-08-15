'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateActivationCode } = require('../src/domain/activationCodes');
const { consumeActivation, normalizeInstancePublicKey } = require('../src/services/consumeActivation');

const pepper = 'pepper-de-prueba-de-activacion-joinpoint-32-bytes';

function createPool(record) {
  const state = { committed: false, rolledBack: false, released: false, calls: [] };
  const connection = {
    beginTransaction: async () => state.calls.push('begin'),
    query: async (sql) => {
      state.calls.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.includes('SELECT ac.id')) return [[record]];
      if (sql.includes('UPDATE activation_codes')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    },
    commit: async () => { state.committed = true; },
    rollback: async () => { state.rolledBack = true; },
    release: () => { state.released = true; },
  };
  return { pool: { getConnection: async () => connection }, state };
}

test('consume una activación una sola vez y vincula una clave Ed25519', async () => {
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const generated = generateActivationCode(pepper);
  const { pool, state } = createPool({
    id: 'code-1', instance_id: 'instance-1', status: 'ISSUED',
    expires_at: new Date('2026-08-16T00:00:00Z'), instance_status: 'PENDING_ACTIVATION',
  });

  const result = await consumeActivation({
    pool, code: generated.code, pepper, instancePublicKeyPem: publicKeyPem,
    sourceIp: '203.0.113.10', now: new Date('2026-08-15T00:00:00Z'),
  });

  assert.equal(result.status, 'ACTIVE');
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, false);
  assert.equal(state.released, true);
});

test('rechaza códigos consumidos o vencidos y revierte la transacción', async () => {
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const generated = generateActivationCode(pepper);
  const used = createPool({ id: 'code-1', instance_id: 'instance-1', status: 'CONSUMED', expires_at: new Date('2026-08-16'), instance_status: 'ACTIVE' });
  await assert.rejects(
    consumeActivation({ pool: used.pool, code: generated.code, pepper, instancePublicKeyPem: publicKeyPem, sourceIp: '203.0.113.10' }),
    /ACTIVATION_CODE_INVALID/,
  );
  assert.equal(used.state.rolledBack, true);

  const expired = createPool({ id: 'code-2', instance_id: 'instance-2', status: 'ISSUED', expires_at: new Date('2026-08-14'), instance_status: 'PENDING_ACTIVATION' });
  await assert.rejects(
    consumeActivation({ pool: expired.pool, code: generated.code, pepper, instancePublicKeyPem: publicKeyPem, sourceIp: '203.0.113.10', now: new Date('2026-08-15') }),
    /ACTIVATION_CODE_EXPIRED/,
  );
  assert.equal(expired.state.rolledBack, true);
});

test('acepta únicamente claves públicas Ed25519', () => {
  const { publicKey: edKey } = crypto.generateKeyPairSync('ed25519');
  assert.match(normalizeInstancePublicKey(edKey.export({ type: 'spki', format: 'pem' })).fingerprint, /^[a-f0-9]{64}$/);
  const { publicKey: rsaKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => normalizeInstancePublicKey(rsaKey.export({ type: 'spki', format: 'pem' })), /INSTANCE_KEY_TYPE_INVALID/);
});
