'use strict';

const crypto = require('crypto');
const { stableJson } = require('./licenses');

const PROTOCOL = 'JP-INSTANCE-V1';
const TRUST_PROTOCOL = 'JP-TRUST-BUNDLE-V1';
const MAX_CLOCK_SKEW_SECONDS = 300;

function bodyDigest(body) { return crypto.createHash('sha256').update(stableJson(body || {})).digest('hex'); }
function canonicalRequest({ method, path, instanceId, timestamp, nonce, body }) {
  return [PROTOCOL, String(method).toUpperCase(), path, instanceId, String(timestamp), nonce, bodyDigest(body)].join('\n');
}
function signInstanceRequest(input, privateKey) {
  const key = privateKey?.type === 'private' ? privateKey : crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('INSTANCE_PRIVATE_KEY_INVALID');
  return crypto.sign(null, Buffer.from(canonicalRequest(input)), key).toString('base64url');
}
function verifyInstanceRequest(input, signature, publicKey) {
  try {
    const key = publicKey?.type === 'public' ? publicKey : crypto.createPublicKey(publicKey);
    return key.asymmetricKeyType === 'ed25519' && crypto.verify(null, Buffer.from(canonicalRequest(input)), key, Buffer.from(signature, 'base64url'));
  } catch (_) { return false; }
}

function trustBundleInput(payload, keyId) { return `${TRUST_PROTOCOL}\n${keyId}\n${stableJson(payload)}`; }
function signTrustBundle(payload, { keyId, privateKey }) {
  const key = privateKey?.type === 'private' ? privateKey : crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('SIGNING_PRIVATE_KEY_INVALID');
  return { protocol:TRUST_PROTOCOL, keyId, payload,
    signature:crypto.sign(null, Buffer.from(trustBundleInput(payload, keyId)), key).toString('base64url') };
}
function verifyTrustBundle(bundle, publicKey) {
  if (bundle?.protocol !== TRUST_PROTOCOL) return false;
  try {
    const key = publicKey?.type === 'public' ? publicKey : crypto.createPublicKey(publicKey);
    return key.asymmetricKeyType === 'ed25519' && crypto.verify(null,
      Buffer.from(trustBundleInput(bundle.payload, bundle.keyId)), key, Buffer.from(bundle.signature, 'base64url'));
  } catch (_) { return false; }
}

module.exports = { PROTOCOL, TRUST_PROTOCOL, MAX_CLOCK_SKEW_SECONDS, bodyDigest, canonicalRequest,
  signInstanceRequest, verifyInstanceRequest, signTrustBundle, verifyTrustBundle };
