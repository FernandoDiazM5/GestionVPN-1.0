const { lowestFreeOctet } = require('../../lib/ipAlloc');

describe('lib/ipAlloc — lowestFreeOctet (reutiliza IPs liberadas)', () => {
  it('pool vacío → devuelve el start', () => {
    expect(lowestFreeOctet([], 20)).toBe(20);
  });

  it('sin huecos → devuelve el siguiente tras el máximo', () => {
    expect(lowestFreeOctet([20, 21, 22], 20)).toBe(23);
  });

  it('reutiliza el hueco más bajo (IP de usuario borrado)', () => {
    // 21 quedó libre al borrar un usuario → se reasigna ahí, no en 24.
    expect(lowestFreeOctet([20, 22, 23], 20)).toBe(21);
  });

  it('ignora octetos por debajo del start', () => {
    expect(lowestFreeOctet([5, 20, 21], 20)).toBe(22);
  });

  it('ignora valores no enteros', () => {
    expect(lowestFreeOctet([NaN, undefined, 20], 20)).toBe(21);
  });

  it('lanza si el pool está agotado', () => {
    const full = Array.from({ length: 235 }, (_, i) => i + 20); // 20..254
    expect(() => lowestFreeOctet(full, 20)).toThrow(/agotado/);
  });
});
