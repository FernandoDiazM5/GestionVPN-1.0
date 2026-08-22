const { mapWgPeer } = require('../../routes/wireguard.routes');

describe('WireGuard peer status', () => {
  it('no marca activo un peer deshabilitado aunque conserve handshake reciente', () => {
    const peer = mapWgPeer({
      '.id': '*1',
      interface: 'WG-USERS',
      disabled: 'true',
      'last-handshake': '2m',
      'allowed-address': '10.12.249.20/32',
      'public-key': 'public-key',
      comment: 'Housenet',
    });

    expect(peer).toMatchObject({ disabled: true, active: false, lastHandshakeSecs: 120 });
  });
});
