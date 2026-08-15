'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateActivationCode } = require('../src/domain/activationCodes');
const { activateInstance } = require('../src/services/activateInstance');
const { publicKeyFingerprint, verifyLicense } = require('../src/domain/licenses');

const activationPepper = 'activation-pepper-joinpoint-prueba-32-bytes';
const rateLimitPepper = 'rate-limit-pepper-joinpoint-prueba-32-bytes';

test('activa y licencia el VPS en una transacción después del rate limit durable', async () => {
  const central = crypto.generateKeyPairSync('ed25519');
  const instance = crypto.generateKeyPairSync('ed25519');
  const centralPublic = central.publicKey.export({ type: 'spki', format: 'pem' });
  const centralPrivate = central.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const instancePublic = instance.publicKey.export({ type: 'spki', format: 'pem' });
  const generated = generateActivationCode(activationPepper);
  const state = { activationCommitted: false, writes: 0, connectionIndex: 0 };
  const rateConnection = { beginTransaction: async()=>{}, query: async sql => sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 1 }], commit: async()=>{}, rollback:async()=>{}, release:()=>{} };
  const activationConnection = {
    beginTransaction: async()=>{},
    query: async sql => {
      if (sql.includes('SELECT ac.id')) return [[{ activation_id:'a1', activation_status:'ISSUED', activation_expires:new Date('2026-08-16'), instance_id:'instance-1', customer_id:'customer-1', instance_status:'PENDING_ACTIVATION', subdomain_label:'cliente-uno', subscription_id:'sub-1', subscription_status:'ACTIVE', ends_at:new Date('2026-09-01'), plan_code:'BASIC', management_cidr:'10.64.0.0/22', root_domain:'joinpoint.cloud', public_key_pem:centralPublic, public_key_fingerprint:publicKeyFingerprint(centralPublic) }]];
      if (sql.startsWith('SELECT feature_key')) return [[{ feature_key:'sites.max', enabled:1, numeric_limit:5 }]];
      state.writes += 1; return [{ affectedRows:1 }];
    },
    commit:async()=>{state.activationCommitted=true;}, rollback:async()=>{}, release:()=>{},
  };
  const pool = { getConnection: async()=> state.connectionIndex++ === 0 ? rateConnection : activationConnection };
  const result = await activateInstance({ pool, code:generated.code, activationPepper, rateLimitPepper, instancePublicKeyPem:instancePublic, sourceIp:'203.0.113.9', signingKeyId:'key-2026', signingPrivateKey:centralPrivate, now:new Date('2026-08-15') });
  assert.equal(result.fqdn, 'cliente-uno.joinpoint.cloud');
  assert.equal(result.managementCidr, '10.64.0.0/22');
  assert.equal(state.activationCommitted, true);
  assert.equal(state.writes, 4);
  assert.equal(verifyLicense(result.license, { publicKeys:{'key-2026':centralPublic}, expectedInstanceId:'instance-1', now:new Date('2026-08-15') }).valid, true);
});
