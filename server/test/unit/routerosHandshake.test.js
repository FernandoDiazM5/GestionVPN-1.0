const { parseHandshakeSecs } = require('../../routeros.service');

describe('parseHandshakeSecs', () => {
  it('convierte segundos, minutos y horas', () => {
    expect(parseHandshakeSecs('2h3m4s')).toBe(7384);
  });

  it('incluye días para no marcar como reciente un handshake antiguo', () => {
    expect(parseHandshakeSecs('5d18h37m')).toBe(499_020);
  });

  it('incluye semanas emitidas por duraciones largas de RouterOS', () => {
    expect(parseHandshakeSecs('1w2d3h4m5s')).toBe(788_645);
  });

  it('trata vacío o cero como handshake inexistente', () => {
    expect(parseHandshakeSecs('')).toBe(Infinity);
    expect(parseHandshakeSecs('0s')).toBe(Infinity);
  });
});
