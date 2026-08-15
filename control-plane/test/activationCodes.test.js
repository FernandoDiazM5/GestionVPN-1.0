'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateActivationCode,
  digestActivationCode,
  verifyActivationCode,
} = require('../src/domain/activationCodes');

const pepper = 'pepper-de-prueba-de-activacion-joinpoint-32-bytes';

test('genera códigos con entropía y almacena sólo su huella', () => {
  const first = generateActivationCode(pepper);
  const second = generateActivationCode(pepper);
  assert.match(first.code, /^JP1-/);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.notEqual(first.code, second.code);
  assert.notEqual(first.digest, second.digest);
  assert.equal(verifyActivationCode(first.code, first.digest, pepper), true);
});

test('normaliza mayúsculas y rechaza código o pepper incorrectos', () => {
  const generated = generateActivationCode(pepper);
  assert.equal(verifyActivationCode(generated.code.toLowerCase(), generated.digest, pepper), true);
  assert.equal(verifyActivationCode(`${generated.code}X`, generated.digest, pepper), false);
  assert.equal(verifyActivationCode(generated.code, digestActivationCode(generated.code, `${pepper}-otro`), pepper), false);
  assert.throws(() => generateActivationCode('corto'), /ACTIVATION_PEPPER_TOO_SHORT/);
});
