'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLicenseLifecycleService } = require('../src/services/licenseLifecycle');

const publicKeyPem = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
const fixedNow = new Date('2026-08-15T12:00:00.000Z');

function transactionalPool({ selected = [] } = {}) {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push(['begin']),
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.startsWith('SELECT key_id')) return [selected];
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => calls.push(['release']),
  };
  return { calls, getConnection: async () => connection, query: async () => [{ affectedRows: 1 }] };
}

test('registra solamente la clave publica y puede activarla atomicamente', async () => {
  const pool = transactionalPool();
  const service = createLicenseLifecycleService({ pool, now: () => fixedNow });
  const result = await service.registerSigningKey({ keyId: 'key-2026-08', publicKeyPem, activate: true });
  assert.equal(result.status, 'ACTIVE');
  assert.match(result.publicKeyFingerprint, /^[a-f0-9]{64}$/);
  const insert = pool.calls.find(call => String(call[0]).includes('INSERT INTO license_signing_keys'));
  assert.equal(insert[1].includes(publicKeyPem), true);
  assert.equal(insert[1].some(value => String(value).includes('PRIVATE KEY')), false);
  assert.equal(pool.calls.some(call => String(call[0]).includes("status='VERIFY_ONLY'")), true);
  assert.equal(pool.calls.some(call => call[0] === 'commit'), true);
});

test('activar una clave conserva la anterior para verificacion', async () => {
  const pool = transactionalPool({ selected: [{ key_id: 'key-new', status: 'VERIFY_ONLY' }] });
  const service = createLicenseLifecycleService({ pool, now: () => fixedNow });
  const result = await service.activateSigningKey('key-new');
  assert.equal(result.status, 'ACTIVE');
  assert.equal(pool.calls.some(call => String(call[0]).includes("status='VERIFY_ONLY'") && call[1]?.includes('key-new')), true);
});

test('revoca una licencia emitida con motivo y sin devolver el token', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push([sql, params]); return [{ affectedRows: 1 }]; } };
  const service = createLicenseLifecycleService({ pool, now: () => fixedNow });
  const reason = 'Compromiso confirmado de credenciales';
  const result = await service.revokeLicense('license-id', reason);
  assert.deepEqual(result, { id: 'license-id', status: 'REVOKED', revokedAt: fixedNow, reason });
  assert.equal(result.token, undefined);
  assert.equal(calls[0][1][1], reason);
});
