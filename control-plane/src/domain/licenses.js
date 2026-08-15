'use strict';

const crypto = require('crypto');

const TOKEN_PREFIX = 'jpl1';
const CLOCK_TOLERANCE_SECONDS = 60;

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function fromBase64url(value) { return Buffer.from(value, 'base64url'); }

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stableJson(value) { return JSON.stringify(stable(value)); }

function normalizeEd25519Key(value, kind) {
  try {
    const key = kind === 'private' ? crypto.createPrivateKey(value) : crypto.createPublicKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('LICENSE_KEY_TYPE_INVALID');
    return key;
  } catch (error) {
    if (error.message === 'LICENSE_KEY_TYPE_INVALID') throw error;
    throw new Error(`LICENSE_${kind.toUpperCase()}_KEY_INVALID`);
  }
}

function signLicense(payload, { keyId, privateKey }) {
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(String(keyId || ''))) throw new Error('LICENSE_KEY_ID_INVALID');
  const header = { alg: 'EdDSA', kid: keyId, typ: 'JPL' };
  const encodedHeader = base64url(stableJson(header));
  const encodedPayload = base64url(stableJson(payload));
  const signingInput = `${TOKEN_PREFIX}.${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign(null, Buffer.from(signingInput), normalizeEd25519Key(privateKey, 'private'));
  return `${signingInput}.${signature.toString('base64url')}`;
}

function verifyLicense(token, { publicKeys, revokedKeyIds = [], expectedInstanceId, now = new Date() }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX) throw new Error('LICENSE_FORMAT_INVALID');
  let header;
  let payload;
  try {
    header = JSON.parse(fromBase64url(parts[1]).toString('utf8'));
    payload = JSON.parse(fromBase64url(parts[2]).toString('utf8'));
  } catch (_) { throw new Error('LICENSE_FORMAT_INVALID'); }
  if (header.alg !== 'EdDSA' || header.typ !== 'JPL' || !header.kid) throw new Error('LICENSE_HEADER_INVALID');
  if (new Set(revokedKeyIds).has(header.kid)) throw new Error('LICENSE_KEY_REVOKED');
  const publicKey = publicKeys?.[header.kid];
  if (!publicKey) throw new Error('LICENSE_KEY_UNKNOWN');
  const valid = crypto.verify(null, Buffer.from(parts.slice(0, 3).join('.')), normalizeEd25519Key(publicKey, 'public'), fromBase64url(parts[3]));
  if (!valid) throw new Error('LICENSE_SIGNATURE_INVALID');
  if (payload.iss !== 'joinpoint-control' || payload.aud !== 'joinpoint-instance') throw new Error('LICENSE_CLAIMS_INVALID');
  if (!expectedInstanceId || payload.instanceId !== expectedInstanceId) throw new Error('LICENSE_INSTANCE_MISMATCH');
  for (const claim of ['iat', 'nbf', 'exp', 'graceUntil']) if (!Number.isInteger(payload[claim])) throw new Error('LICENSE_CLAIMS_INVALID');
  if (payload.graceUntil < payload.exp || payload.exp <= payload.nbf) throw new Error('LICENSE_CLAIMS_INVALID');
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (nowSeconds + CLOCK_TOLERANCE_SECONDS < payload.nbf) return { valid: false, state: 'NOT_YET_VALID', payload, keyId: header.kid };
  if (nowSeconds <= payload.exp + CLOCK_TOLERANCE_SECONDS) return { valid: true, state: 'ACTIVE', payload, keyId: header.kid };
  if (nowSeconds <= payload.graceUntil + CLOCK_TOLERANCE_SECONDS) return { valid: true, state: 'OFFLINE_GRACE', payload, keyId: header.kid };
  return { valid: false, state: 'EXPIRED', payload, keyId: header.kid };
}

function publicKeyFingerprint(publicKey) {
  const der = normalizeEd25519Key(publicKey, 'public').export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex');
}

module.exports = { TOKEN_PREFIX, CLOCK_TOLERANCE_SECONDS, stableJson, signLicense, verifyLicense, publicKeyFingerprint };
