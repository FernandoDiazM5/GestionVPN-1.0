'use strict';

const crypto = require('crypto');

function coded(code) { const error = new Error(code); error.code = code; return error; }
function deriveKey(masterKey) {
  const master = Buffer.from(String(masterKey || ''), 'base64');
  if (master.length !== 32) throw coded('PLATFORM_SECRET_KEY_INVALID');
  return crypto.hkdfSync('sha256', master, Buffer.from('joinpoint-central'), Buffer.from('provider-secrets-v1'), 32);
}
function encryptPlatformSecret(secret, masterKey, context) {
  if (!String(secret || '')) throw coded('PLATFORM_SECRET_REQUIRED');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(masterKey), iv);
  cipher.setAAD(Buffer.from(String(context || '')));
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}
function decryptPlatformSecret(value, masterKey, context) {
  try {
    const [version, iv, encrypted, tag] = String(value || '').split('.');
    if (version !== 'v1') throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(masterKey), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(String(context || '')));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) { throw coded('PLATFORM_SECRET_INVALID'); }
}

module.exports = { encryptPlatformSecret, decryptPlatformSecret };
