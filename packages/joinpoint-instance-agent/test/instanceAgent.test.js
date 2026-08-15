'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { InstanceAgent } = require('../src');
const { signLicense, signTrustBundle, publicKeyFingerprint } = require('@joinpoint/protocol');

const instanceId = '550e8400-e29b-41d4-a716-446655440000';
const baseNow = new Date('2026-08-15T12:00:00Z');

test('exige HTTPS fuera de pruebas locales explícitas', () => {
  assert.throws(() => new InstanceAgent({ instanceId, centralUrl:'http://central.joinpoint.cloud',
    privateKeyFile:'unused', stateDirectory:'unused', softwareVersion:'1.0.0' }), /CENTRAL_HTTPS_REQUIRED/);
});

async function fixture(fetchImpl = async()=>{ throw new Error('offline'); }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'joinpoint-agent-'));
  const central = crypto.generateKeyPairSync('ed25519');
  const instance = crypto.generateKeyPairSync('ed25519');
  const centralPublic = central.publicKey.export({ type:'spki', format:'pem' });
  const instancePrivateFile = path.join(directory, 'instance-private.pem');
  await fs.writeFile(instancePrivateFile, instance.privateKey.export({ type:'pkcs8', format:'pem' }), { mode:0o600 });
  let clock = new Date(baseNow);
  const agent = new InstanceAgent({ instanceId, centralUrl:'http://127.0.0.1:3100', privateKeyFile:instancePrivateFile,
    stateDirectory:path.join(directory, 'state'), softwareVersion:'1.0.0', fetchImpl, now:()=>new Date(clock), allowInsecureLocalhost:true });
  const payload = { iss:'joinpoint-control', aud:'joinpoint-instance', jti:'license-1', instanceId,
    entitlements:{ 'sites.max':5, 'devices.scan':true }, iat:Math.floor(clock/1000), nbf:Math.floor(clock/1000),
    exp:Math.floor(clock/1000)+3600, graceUntil:Math.floor(clock/1000)+14400 };
  const license = signLicense(payload, { keyId:'central-1', privateKey:central.privateKey });
  await agent.bootstrap({ instanceId, license, licensePublicKey:centralPublic });
  return { directory, central, centralPublic, agent, setClock:value=>{clock=new Date(value);}, license };
}

test('bootstrap fija la clave central y persiste estado atómico restrictivo', async t => {
  const setup = await fixture(); t.after(()=>fs.rm(setup.directory, {recursive:true,force:true}));
  const state = await setup.agent.store.read();
  assert.equal(state.capabilities.commercialState, 'ACTIVE');
  assert.equal(state.capabilities.networkContinuity, true);
  assert.equal(state.trustBundle.payload.keys[0].fingerprint, publicKeyFingerprint(setup.centralPublic));
  if (process.platform !== 'win32') assert.equal((await fs.stat(setup.agent.store.file)).mode & 0o777, 0o600);
});

test('sincroniza un paquete firmado y conserva capacidades verificadas', async t => {
  let responseEnvelope;
  let captured;
  const setup = await fixture(async (_url, options) => { captured=options; return { ok:true, json:async()=>responseEnvelope }; });
  t.after(()=>fs.rm(setup.directory, {recursive:true,force:true}));
  const payload = { generatedAt:Math.floor(baseNow/1000)+60, keys:[{ keyId:'central-1', algorithm:'Ed25519',
    publicKeyPem:setup.centralPublic, fingerprint:publicKeyFingerprint(setup.centralPublic), status:'ACTIVE', activatedAt:baseNow.toISOString(), retiredAt:null }], revokedLicenses:[] };
  responseEnvelope = { success:true, sync:{ trustBundle:signTrustBundle(payload, {keyId:'central-1',privateKey:setup.central.privateKey}) } };
  setup.setClock('2026-08-15T12:01:00Z');
  const state = await setup.agent.sync();
  assert.equal(state.centralReachable, true);
  assert.equal(state.capabilities.entitlements['sites.max'], 5);
  assert.match(captured.headers['x-joinpoint-signature'], /^[A-Za-z0-9_-]{86}$/);
});

test('un paquete alterado no reemplaza la confianza fijada', async t => {
  let envelope;
  const setup = await fixture(async()=>({ok:true,json:async()=>envelope}));
  t.after(()=>fs.rm(setup.directory, {recursive:true,force:true}));
  const payload = { generatedAt:Math.floor(baseNow/1000)+60, keys:[{ keyId:'central-1', algorithm:'Ed25519',
    publicKeyPem:setup.centralPublic, fingerprint:publicKeyFingerprint(setup.centralPublic), status:'ACTIVE' }], revokedLicenses:[] };
  const signed = signTrustBundle(payload, {keyId:'central-1',privateKey:setup.central.privateKey});
  signed.payload.revokedLicenses = [{id:'license-1'}];
  envelope = {success:true,sync:{trustBundle:signed}};
  const state = await setup.agent.sync();
  assert.equal(state.centralReachable, true);
  assert.equal(state.lastSyncError, 'TRUST_BUNDLE_SIGNATURE_INVALID');
  assert.equal(state.trustBundle.protocol, 'JP-BOOTSTRAP-PIN-V1');
});

test('sin Central entra en gracia offline pero nunca desactiva la red', async t => {
  const setup = await fixture(); t.after(()=>fs.rm(setup.directory, {recursive:true,force:true}));
  setup.setClock('2026-08-15T14:00:00Z');
  const state = await setup.agent.sync();
  assert.equal(state.centralReachable, false);
  assert.equal(state.capabilities.commercialState, 'OFFLINE_GRACE');
  assert.equal(state.capabilities.networkContinuity, true);
  assert.deepEqual(setup.agent.planLicenseRequest(state), { requestLicense:true, licenseReason:'RENEWAL' });
});
