'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { issueLicense } = require('../src/services/issueLicense');
const { publicKeyFingerprint, verifyLicense } = require('../src/domain/licenses');

const keys = crypto.generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });

function fixture(overrides = {}) {
  const state = { commit: false, rollback: false, writes: [] };
  const record = { instance_id: 'instance-1', customer_id: 'customer-1', instance_status: 'ACTIVE', instance_fingerprint: 'a'.repeat(64), subscription_id: 'subscription-1', subscription_status: 'ACTIVE', ends_at: new Date('2026-09-01T00:00:00Z'), plan_code: 'BASIC', public_key_pem: publicKey, public_key_fingerprint: publicKeyFingerprint(publicKey), ...overrides };
  const connection = {
    beginTransaction: async () => {},
    query: async sql => {
      if (sql.includes('SELECT pi.id')) return [[record]];
      if (sql.includes('SELECT pe.feature_key')) return [[{ feature_key: 'sites.max', enabled: 1, numeric_limit: 5 }, { feature_key: 'devices.scan', enabled: 0, numeric_limit: null }]];
      state.writes.push(sql); return [{ affectedRows: 1 }];
    },
    commit: async () => { state.commit = true; }, rollback: async () => { state.rollback = true; }, release: () => {},
  };
  return { pool: { getConnection: async () => connection }, state };
}

test('emite, persiste y verifica una licencia desde la suscripción vigente', async () => {
  const { pool, state } = fixture();
  const issued = await issueLicense({ pool, instanceId: 'instance-1', keyId: 'key-2026', privateKey, now: new Date('2026-08-15T00:00:00Z') });
  const verified = verifyLicense(issued.token, { publicKeys: { 'key-2026': publicKey }, expectedInstanceId: 'instance-1', now: new Date('2026-08-15T00:00:00Z') });
  assert.equal(verified.valid, true);
  assert.deepEqual(issued.entitlements, { 'sites.max': 5, 'devices.scan': false });
  assert.equal(state.commit, true);
  assert.equal(state.writes.length, 2);
});

test('no firma una suscripción vencida', async () => {
  const { pool, state } = fixture({ ends_at: new Date('2026-08-14T00:00:00Z') });
  await assert.rejects(issueLicense({ pool, instanceId: 'instance-1', keyId: 'key-2026', privateKey, now: new Date('2026-08-15T00:00:00Z') }), /SUBSCRIPTION_EXPIRED/);
  assert.equal(state.rollback, true);
});
