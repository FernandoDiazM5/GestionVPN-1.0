// ============================================================
//  test/unit/crypto.test.js — cifrado AES-256-GCM de credenciales
//
//  Requiere `.db_secret` (32 bytes) en server/. Si no existe, los
//  tests se skipean en lugar de fallar (CI sin secret).
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const SECRET_PATH = path.join(__dirname, '..', '..', '.db_secret');
const hasSecret = fs.existsSync(SECRET_PATH);

const desc = hasSecret ? describe : describe.skip;

desc('lib/crypto — round-trip AES-256-GCM', () => {
  let crypto;
  beforeAll(() => {
    crypto = require('../../lib/crypto');
  });

  it('encrypt(x) → decrypt(...) === x para ASCII corto', () => {
    const plain = 'micontraseñasecreta';
    const enc = crypto.encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(crypto.decrypt(enc)).toBe(plain);
  });

  it('encrypt(string vacío) decodifica como cadena vacía', () => {
    const enc = crypto.encrypt('');
    expect(crypto.decrypt(enc)).toBe('');
  });

  it('encrypt es no determinista (IV aleatorio): dos cifrados ≠', () => {
    const a = crypto.encrypt('mismo');
    const b = crypto.encrypt('mismo');
    expect(a).not.toBe(b);
    expect(crypto.decrypt(a)).toBe('mismo');
    expect(crypto.decrypt(b)).toBe('mismo');
  });

  it('decrypt de un valor manipulado falla silencioso (devuelve "")', () => {
    const enc = crypto.encrypt('integro');
    // Corrompemos el ciphertext: flip de un char hex
    const tampered = enc.slice(0, -2) + (enc.endsWith('0') ? '1' : '0');
    expect(crypto.decrypt(tampered)).toBe('');
  });

  it('soporta UTF-8 multibyte (emoji + acentos)', () => {
    const plain = 'Niño 🚀 Ñandú €';
    expect(crypto.decrypt(crypto.encrypt(plain))).toBe(plain);
  });
});

if (!hasSecret) {
  // Mensaje visible en el reporter sin fallar el run.
  // eslint-disable-next-line no-console
  console.log('[crypto.test] .db_secret no presente — tests skipeados (CI o instalación nueva).');
}
