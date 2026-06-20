// ============================================================
//  test/unit/sstpCreds.test.js — generación dinámica de credenciales PPP
// ============================================================
const { generatePppPassword, generatePppUser } = require('../../lib/sstpCreds');

describe('generatePppPassword', () => {
  it('genera una contraseña alfanumérica de la longitud pedida (default 20)', () => {
    expect(generatePppPassword()).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(generatePppPassword(32)).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('no usa caracteres que rompan el script RouterOS (espacios/comillas/metacaracteres)', () => {
    const p = generatePppPassword(64);
    expect(p).not.toMatch(/[\s"'=$;]/);
  });

  it('cada llamada produce una contraseña distinta', () => {
    expect(generatePppPassword()).not.toBe(generatePppPassword());
  });
});

describe('generatePppUser', () => {
  it('deriva un usuario único por nodo: ppp-<nombre>-nd<ND>', () => {
    expect(generatePppUser('TORREX', 2)).toBe('ppp-torrex-nd2');
  });

  it('sanea el nombre (solo a-z0-9) y resiste vacíos', () => {
    expect(generatePppUser('Torre Ñandú-7!', 5)).toBe('ppp-torreand7-nd5');
    expect(generatePppUser('', 3)).toBe('ppp-nodo-nd3');
  });
});
