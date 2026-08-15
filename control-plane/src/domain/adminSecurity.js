'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function coded(code) { const error = new Error(code); error.code = code; return error; }
function digest(value) { return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex'); }
function normalizeRecoveryCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function recoveryCodeDigest(value, pepper) {
  return crypto.createHmac('sha256', String(pepper || '')).update(normalizeRecoveryCode(value)).digest('hex');
}
function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(10).toString('hex').toUpperCase();
    return `JPR-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15)}`;
  });
}

async function hashPassword(password, salt = crypto.randomBytes(16)) {
  if (Buffer.byteLength(String(password || '')) < 12) throw coded('PASSWORD_TOO_SHORT');
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, salt, expected] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !expected) return false;
  try {
    const actual = await scrypt(password, Buffer.from(salt, 'base64url'), 64,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    const expectedBuffer = Buffer.from(expected, 'base64url');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  } catch (_) { return false; }
}

function decodeBase32(value) {
  const clean = String(value || '').toUpperCase().replace(/=+$/g, '');
  let bits = '';
  for (const character of clean) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw coded('TOTP_SECRET_INVALID');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateTotpSecret(bytes = crypto.randomBytes(20)) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let result = '';
  for (let index = 0; index < bits.length; index += 5) result += BASE32[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return result;
}

function verifyTotp(secret, code, now = new Date(), window = 1) {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const key = decodeBase32(secret);
  const counter = Math.floor(now.getTime() / 30000);
  for (let offset = -window; offset <= window; offset += 1) {
    const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter + offset));
    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const index = hmac[hmac.length - 1] & 15;
    const value = (hmac.readUInt32BE(index) & 0x7fffffff) % 1000000;
    const expected = String(value).padStart(6, '0');
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return true;
  }
  return false;
}

function encryptionKey(value) {
  const key = Buffer.from(String(value || ''), 'base64');
  if (key.length !== 32) throw coded('ADMIN_MFA_KEY_INVALID');
  return key;
}

function encryptSecret(secret, keyValue) {
  decodeBase32(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(keyValue), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

function decryptSecret(value, keyValue) {
  try {
    const [version, iv, encrypted, tag] = String(value || '').split('.');
    if (version !== 'v1') throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(keyValue), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) { throw coded('ADMIN_MFA_SECRET_INVALID'); }
}

module.exports = { digest, normalizeRecoveryCode, recoveryCodeDigest, generateRecoveryCodes,
  hashPassword, verifyPassword, generateTotpSecret, verifyTotp, encryptSecret, decryptSecret };
