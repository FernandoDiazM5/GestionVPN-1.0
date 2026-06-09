// ============================================================
//  smoke.test.js — verifica que el runner funciona
//
//  Este test NO ejerce código del proyecto a propósito: solo confirma
//  que vitest carga el setup, encuentra los specs y ejecuta. Sirve
//  de canary cuando rompemos algo en la configuración global.
// ============================================================

describe('vitest smoke (backend)', () => {
  it('expect funciona y NODE_ENV está en test', () => {
    expect(2 + 2).toBe(4);
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('importar logger no rompe en silent', () => {
    // El logger debe inicializarse sin emitir output a stdout.
    const logger = require('../lib/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('importar wgkeys genera par X25519 válido', () => {
    const { generateKeyPair } = require('../lib/wgkeys');
    const { publicKey, privateKey } = generateKeyPair();
    // base64 de 32 bytes → 44 chars con padding
    expect(publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(publicKey).not.toBe(privateKey);
  });
});
