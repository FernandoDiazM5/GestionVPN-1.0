'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, generateTotpSecret, verifyTotp, encryptSecret, decryptSecret } = require('../src/domain/adminSecurity');

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
