'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { publicKeyFingerprint, verifyLicense } = require('../../src/domain/licenses');

const enabled = process.env.CONTROL_INTEGRATION_TEST === 'true';

test('flujo HTTP completo contra MariaDB real', { skip: !enabled }, async () => {
  const pool = mysql.createPool({ host: process.env.CONTROL_TEST_DB_HOST || '127.0.0.1', port: Number(process.env.CONTROL_TEST_DB_PORT), user: 'root', database: 'joinpoint_control', connectionLimit: 4 });
  const central = crypto.generateKeyPairSync('ed25519');
  const centralPublic = central.publicKey.export({ type: 'spki', format: 'pem' });
  const centralPrivate = central.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const instance = crypto.generateKeyPairSync('ed25519');
  const instancePublic = instance.publicKey.export({ type: 'spki', format: 'pem' });
  const keyId = 'integration-key';
  const adminToken = 'integration-admin-token-joinpoint-32-characters';
  const activationPepper = 'integration-activation-pepper-joinpoint-32';
  const rateLimitPepper = 'integration-rate-limit-pepper-joinpoint-32';
  const now = new Date('2026-08-15T12:00:00Z');
  await pool.query('INSERT INTO license_signing_keys (key_id,public_key_pem,public_key_fingerprint,activated_at) VALUES (?,?,?,?)', [keyId, centralPublic, publicKeyFingerprint(centralPublic), now]);
  const app = createApp({ pool, adminToken, activationPepper, rateLimitPepper, signingKeyId:keyId, signingPrivateKey:centralPrivate, now:()=>now });
  const auth = { Authorization:`Bearer ${adminToken}` };
  try {
    const customer = (await request(app).post('/api/admin/customers').set(auth).send({ legalName:'Cliente Integración SAC', displayName:'Cliente Integración' }).expect(201)).body.customer;
    const plan = (await request(app).post('/api/admin/plans').set(auth).send({ code:'BASIC', name:'Básico', entitlements:[{key:'sites.max',enabled:true,limit:5}] }).expect(201)).body.plan;
    const instanceRecord = (await request(app).post('/api/admin/instances').set(auth).send({ customerId:customer.id }).expect(201)).body.instance;
    assert.equal(instanceRecord.fqdn, 'cliente-integracion.joinpoint.cloud');
    assert.equal(instanceRecord.managementCidr, '10.64.0.0/22');
    await request(app).post(`/api/admin/instances/${instanceRecord.id}/subscriptions`).set(auth).send({ planId:plan.id, status:'ACTIVE', startsAt:'2026-08-15T00:00:00.000Z', endsAt:'2026-09-15T00:00:00.000Z' }).expect(201);
    const activationCode = (await request(app).post(`/api/admin/instances/${instanceRecord.id}/activation-codes`).set(auth).send({ ttlHours:24 }).expect(201)).body.activation.code;
    const activated = (await request(app).post('/api/activate').send({ code:activationCode, instancePublicKeyPem:instancePublic }).expect(201)).body.activation;
    assert.equal(activated.instanceId, instanceRecord.id);
    assert.equal(verifyLicense(activated.license, { publicKeys:{[keyId]:centralPublic}, expectedInstanceId:instanceRecord.id, now }).valid, true);
    await request(app).post('/api/activate').send({ code:activationCode, instancePublicKeyPem:instancePublic }).expect(400, { success:false, code:'ACTIVATION_FAILED' });
    const [counts] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM instance_identities) identities,
      (SELECT COUNT(*) FROM instance_licenses WHERE status='ISSUED') licenses,
      (SELECT COUNT(*) FROM activation_codes WHERE status='CONSUMED') consumed`);
    assert.deepEqual({ ...counts[0] }, { identities:1, licenses:1, consumed:1 });
  } finally { await pool.end(); }
});
