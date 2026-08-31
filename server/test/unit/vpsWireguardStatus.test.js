const { normalizeAddresses, normalizeRoutes } = require('../../lib/vpsWireguardStatus');

describe('vpsWireguardStatus', () => {
  it('normaliza direcciones sin incluir datos sensibles', () => {
    expect(normalizeAddresses([{ addr_info: [
      { family: 'inet', local: '10.12.250.60', prefixlen: 32 },
      { family: 'link', local: 'ignored', prefixlen: 0 },
    ] }])).toEqual(['10.12.250.60/32']);
  });

  it('limita las rutas a campos de destino seguros', () => {
    expect(normalizeRoutes([
      { dst: '10.12.248.0/22', dev: 'wg0' },
      { gateway: '10.12.250.1', dev: 'wg0' },
    ])).toEqual(['10.12.248.0/22', '10.12.250.1']);
  });
});
