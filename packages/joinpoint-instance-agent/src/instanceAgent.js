'use strict';

const fs = require('fs/promises');
const crypto = require('crypto');
const { AtomicStateStore } = require('./atomicStateStore');
const { signInstanceRequest, verifyTrustBundle, verifyLicense, publicKeyFingerprint } = require('@joinpoint/protocol');

function coded(code) { const error = new Error(code); error.code = code; return error; }
function decodeLicense(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 4) throw new Error();
    return { header:JSON.parse(Buffer.from(parts[1], 'base64url')), payload:JSON.parse(Buffer.from(parts[2], 'base64url')) };
  } catch (_) { throw coded('LOCAL_LICENSE_FORMAT_INVALID'); }
}
function capabilities(verification, revoked = false) {
  const usable = !revoked && Boolean(verification?.valid);
  return { networkContinuity:true, commercialState:revoked ? 'REVOKED' : verification?.state || 'MISSING',
    entitlements:usable ? verification.payload.entitlements || {} : {} };
}
function keyMap(bundle) { return Object.fromEntries(bundle.payload.keys.map(key => [key.keyId, key.publicKeyPem])); }

class InstanceAgent {
  constructor({ instanceId, centralUrl, privateKeyFile, stateDirectory, softwareVersion, fetchImpl = globalThis.fetch,
    now = () => new Date(), allowInsecureLocalhost = false }) {
    this.instanceId = instanceId; this.centralUrl = new URL(centralUrl); this.privateKeyFile = privateKeyFile;
    this.softwareVersion = softwareVersion; this.fetch = fetchImpl; this.now = now;
    this.store = new AtomicStateStore(stateDirectory);
    const local = ['127.0.0.1', 'localhost'].includes(this.centralUrl.hostname);
    if (this.centralUrl.protocol !== 'https:' && !(allowInsecureLocalhost && local)) throw coded('CENTRAL_HTTPS_REQUIRED');
  }

  async bootstrap(activation) {
    if (activation.instanceId !== this.instanceId) throw coded('BOOTSTRAP_INSTANCE_MISMATCH');
    const decoded = decodeLicense(activation.license);
    const verification = verifyLicense(activation.license, { publicKeys:{ [decoded.header.kid]:activation.licensePublicKey },
      expectedInstanceId:this.instanceId, now:this.now() });
    if (!verification.valid || publicKeyFingerprint(activation.licensePublicKey).length !== 64) throw coded('BOOTSTRAP_LICENSE_INVALID');
    const trustBundle = { protocol:'JP-BOOTSTRAP-PIN-V1', keyId:decoded.header.kid,
      payload:{ generatedAt:verification.payload.iat, keys:[{ keyId:decoded.header.kid, algorithm:'Ed25519',
        publicKeyPem:activation.licensePublicKey, fingerprint:publicKeyFingerprint(activation.licensePublicKey), status:'ACTIVE' }], revokedLicenses:[] } };
    const state = { version:1, instanceId:this.instanceId, trustBundle, license:activation.license,
      capabilities:capabilities(verification), centralReachable:true, lastSuccessfulSyncAt:null, updatedAt:this.now().toISOString() };
    await this.store.write(state);
    return state;
  }

  evaluate(state, now = this.now()) {
    if (!state.license) return { verification:null, revoked:false, capabilities:capabilities(null) };
    const decoded = decodeLicense(state.license);
    const revokedIds = new Set((state.trustBundle.payload.revokedLicenses || []).map(item => item.id));
    const revoked = revokedIds.has(decoded.payload.jti);
    const revokedKeyIds = state.trustBundle.payload.keys.filter(key => key.status === 'REVOKED').map(key => key.keyId);
    let verification;
    try { verification = verifyLicense(state.license, { publicKeys:keyMap(state.trustBundle), revokedKeyIds,
      expectedInstanceId:this.instanceId, now }); }
    catch (error) {
      if (error.message !== 'LICENSE_KEY_REVOKED') throw error;
      verification = { valid:false, state:'KEY_REVOKED', payload:decoded.payload };
      return { verification, revoked:true, capabilities:capabilities(verification, true) };
    }
    return { verification, revoked, capabilities:capabilities(verification, revoked) };
  }

  planLicenseRequest(state, now = this.now()) {
    if (!state.license) return { requestLicense:true, licenseReason:'MISSING' };
    if (state.capabilities?.commercialState === 'REVOKED') return {};
    const { payload } = decodeLicense(state.license);
    return payload.exp * 1000 - now.getTime() <= 48 * 3600000
      ? { requestLicense:true, licenseReason:'RENEWAL' } : {};
  }

  async heartbeat() {
    const state = await this.store.read();
    return this.sync(this.planLicenseRequest(state));
  }

  async readPrivateKey() {
    const stat = await fs.stat(this.privateKeyFile);
    if (!stat.isFile()) throw coded('INSTANCE_PRIVATE_KEY_NOT_FILE');
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw coded('INSTANCE_PRIVATE_KEY_PERMISSIONS');
    return fs.readFile(this.privateKeyFile, 'utf8');
  }

  async sync({ requestLicense, licenseReason } = {}) {
    const previous = await this.store.read();
    const body = { softwareVersion:this.softwareVersion, requestLicense:Boolean(requestLicense),
      ...(requestLicense ? { licenseReason } : {}) };
    const timestamp = Math.floor(this.now().getTime() / 1000);
    const nonce = crypto.randomBytes(16).toString('base64url');
    const privateKey = await this.readPrivateKey();
    const signature = signInstanceRequest({ method:'POST', path:'/api/instance/sync', instanceId:this.instanceId,
      timestamp, nonce, body }, privateKey);
    let response;
    try {
      response = await this.fetch(new URL('/api/instance/sync', this.centralUrl), { method:'POST', signal:AbortSignal.timeout(15000),
        headers:{ 'content-type':'application/json', 'x-joinpoint-instance':this.instanceId,
          'x-joinpoint-timestamp':String(timestamp), 'x-joinpoint-nonce':nonce, 'x-joinpoint-signature':signature },
        body:JSON.stringify(body) });
      if (!response.ok) throw coded(`CENTRAL_SYNC_HTTP_${response.status}`);
      const envelope = await response.json();
      if (!envelope.success || !envelope.sync?.trustBundle) throw coded('CENTRAL_SYNC_RESPONSE_INVALID');
      const signer = previous.trustBundle.payload.keys.find(key => key.keyId === envelope.sync.trustBundle.keyId && key.status !== 'REVOKED');
      if (!signer || !verifyTrustBundle(envelope.sync.trustBundle, signer.publicKeyPem)) throw coded('TRUST_BUNDLE_SIGNATURE_INVALID');
      const incoming = envelope.sync.trustBundle;
      if (Number(incoming.payload.generatedAt) < Number(previous.trustBundle.payload.generatedAt || 0)) throw coded('TRUST_BUNDLE_ROLLBACK');
      for (const key of incoming.payload.keys) if (publicKeyFingerprint(key.publicKeyPem) !== key.fingerprint) throw coded('TRUST_KEY_FINGERPRINT_MISMATCH');
      if (incoming.payload.keys.filter(key => key.status === 'ACTIVE').length !== 1) throw coded('TRUST_ACTIVE_KEY_INVALID');
      const candidate = envelope.sync.license?.token || previous.license;
      const next = { ...previous, trustBundle:incoming, license:candidate, centralReachable:true,
        lastSuccessfulSyncAt:this.now().toISOString(), lastSyncError:null, updatedAt:this.now().toISOString() };
      next.capabilities = this.evaluate(next).capabilities;
      await this.store.write(next);
      return next;
    } catch (error) {
      const offline = { ...previous, centralReachable:Boolean(response), lastSyncError:error.code || 'CENTRAL_UNREACHABLE', updatedAt:this.now().toISOString() };
      try { offline.capabilities = this.evaluate(offline).capabilities; } catch (_) { offline.capabilities = capabilities(null); }
      await this.store.write(offline);
      return offline;
    }
  }
}

module.exports = { InstanceAgent, decodeLicense, capabilities };
