'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { signLicense, verifyLicense, publicKeyFingerprint } = require('../src/domain/licenses');

const keys = crypto.generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const base = {
  iss: 'joinpoint-control', aud: 'joinpoint-instance', jti: 'license-1',
  instanceId: 'instance-1', customerId: 'customer-1', plan: 'BASIC',
  entitlements: { 'sites.max': 5, 'devices.scan': false },
  iat: 1_786_800_000, nbf: 1_786_800_000, exp: 1_787_404_800, graceUntil: 1_787_664_000,
};

test('firma y verifica una licencia vinculada a una instancia', () => {
  const token = signLicense(base, { keyId: 'key-2026-01', privateKey });
  const result = verifyLicense(token, { publicKeys: { 'key-2026-01': publicKey }, expectedInstanceId: 'instance-1', now: new Date(base.nbf * 1000) });
  assert.equal(result.valid, true);
  assert.equal(result.state, 'ACTIVE');
  assert.match(publicKeyFingerprint(publicKey), /^[a-f0-9]{64}$/);
});

test('detecta manipulación y vínculo con otra instancia', () => {
  const token = signLicense(base, { keyId: 'key-2026-01', privateKey });
  const parts = token.split('.');
  const changedPayload = { ...JSON.parse(Buffer.from(parts[2], 'base64url').toString('utf8')), plan: 'ADVANCED' };
  parts[2] = Buffer.from(JSON.stringify(changedPayload)).toString('base64url');
  assert.throws(() => verifyLicense(parts.join('.'), { publicKeys: { 'key-2026-01': publicKey }, expectedInstanceId: 'instance-1' }), /LICENSE_SIGNATURE_INVALID/);
  assert.throws(() => verifyLicense(token, { publicKeys: { 'key-2026-01': publicKey }, expectedInstanceId: 'instance-2' }), /LICENSE_INSTANCE_MISMATCH/);
});

test('distingue vigencia, gracia offline y expiración sin apagar la red', () => {
  const token = signLicense(base, { keyId: 'key-2026-01', privateKey });
  const options = { publicKeys: { 'key-2026-01': publicKey }, expectedInstanceId: 'instance-1' };
  assert.equal(verifyLicense(token, { ...options, now: new Date((base.exp + 120) * 1000) }).state, 'OFFLINE_GRACE');
  const expired = verifyLicense(token, { ...options, now: new Date((base.graceUntil + 120) * 1000) });
  assert.equal(expired.valid, false);
  assert.equal(expired.state, 'EXPIRED');
});

test('rechaza inmediatamente las licencias firmadas por una clave revocada', () => {
  const token = signLicense(base, { keyId: 'key-2026-01', privateKey });
  assert.throws(() => verifyLicense(token, {
    publicKeys: { 'key-2026-01': publicKey },
    revokedKeyIds: ['key-2026-01'],
    expectedInstanceId: 'instance-1',
  }), /LICENSE_KEY_REVOKED/);
});
