'use strict';

const crypto = require('crypto');

const ACTIVATION_PREFIX = 'JP1';
const MIN_PEPPER_BYTES = 32;

function assertPepper(pepper) {
  const normalized = String(pepper || '');
  if (Buffer.byteLength(normalized, 'utf8') < MIN_PEPPER_BYTES) {
    throw new Error('ACTIVATION_PEPPER_TOO_SHORT');
  }
  return normalized;
}

function normalizeActivationCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function digestActivationCode(code, pepper) {
  return crypto
    .createHmac('sha256', assertPepper(pepper))
    .update(normalizeActivationCode(code), 'utf8')
    .digest('hex');
}

function generateActivationCode(pepper) {
  assertPepper(pepper);
  const payload = crypto.randomBytes(24).toString('base64url').toUpperCase();
  const grouped = payload.match(/.{1,6}/g).join('-');
  const code = `${ACTIVATION_PREFIX}-${grouped}`;
  return { code, digest: digestActivationCode(code, pepper) };
}

function verifyActivationCode(code, expectedDigest, pepper) {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedDigest || ''))) return false;
  const actual = Buffer.from(digestActivationCode(code, pepper), 'hex');
  const expected = Buffer.from(expectedDigest, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  ACTIVATION_PREFIX,
  MIN_PEPPER_BYTES,
  normalizeActivationCode,
  digestActivationCode,
  generateActivationCode,
  verifyActivationCode,
};
