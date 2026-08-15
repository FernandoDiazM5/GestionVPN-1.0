'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, generateTotpSecret, verifyTotp, encryptSecret, decryptSecret,
  generateRecoveryCodes, recoveryCodeDigest } = require('../src/domain/adminSecurity');

const encryptionKey = Buffer.alloc(32, 7).toString('base64');

test('deriva contraseñas con scrypt y comparación segura', async () => {
  const encoded = await hashPassword('una-contraseña-administrativa-segura');
  assert.match(encoded, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword('una-contraseña-administrativa-segura', encoded), true);
  assert.equal(await verifyPassword('contraseña-incorrecta', encoded), false);
  assert.equal(encoded.includes('una-contraseña'), false);
});

test('genera, cifra y recupera secretos TOTP sin guardarlos en claro', () => {
  const secret = generateTotpSecret(Buffer.alloc(20, 5));
  const encrypted = encryptSecret(secret, encryptionKey);
  assert.notEqual(encrypted.includes(secret), true);
  assert.equal(decryptSecret(encrypted, encryptionKey), secret);
  assert.throws(() => decryptSecret(`${encrypted}x`, encryptionKey), /ADMIN_MFA_SECRET_INVALID/);
});

test('verifica TOTP con una ventana temporal acotada', () => {
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(verifyTotp(rfcSecret, '287082', new Date(59_000), 0), true);
  assert.equal(verifyTotp(rfcSecret, '287082', new Date(120_000), 0), false);
  assert.equal(verifyTotp(rfcSecret, 'abcdef', new Date(59_000), 0), false);
});

test('genera códigos de recuperación aleatorios y conserva sólo HMAC', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0], /^JPR-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}$/);
  const stored = recoveryCodeDigest(codes[0], 'pepper-de-recuperacion-seguro-32-caracteres');
  assert.match(stored, /^[a-f0-9]{64}$/);
  assert.equal(stored.includes(codes[0]), false);
  assert.equal(recoveryCodeDigest(codes[0].toLowerCase().replaceAll('-', ''), 'pepper-de-recuperacion-seguro-32-caracteres'), stored);
});
