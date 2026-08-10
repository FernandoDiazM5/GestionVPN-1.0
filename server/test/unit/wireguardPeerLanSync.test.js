const { stubModule } = require('../helpers/moduleMock');

const safeWrite = vi.fn();
stubModule(__dirname, '../../routeros.service', { safeWrite });

const {
  resolvePeer,
  sameAddresses,
  syncPeerLanAddresses,
} = require('../../lib/wireguardPeerLanSync');

const peer = (id, iface, key, allowed = '') => ({
  '.id': id,
  interface: iface,
  'public-key': key,
  'allowed-address': allowed,
});

beforeEach(() => vi.clearAllMocks());

describe('resolvePeer', () => {
  it('prioriza la clave pública persistida', () => {
    const peers = [peer('*1', 'WG-ND1', 'A'), peer('*2', 'WG-ND1', 'B')];
    expect(resolvePeer(peers, { interfaceName: 'WG-ND1', publicKey: 'B' })).toEqual({
      peer: peers[1], resolution: 'public-key',
    });
  });

  it('cura nodos históricos sin clave si la interfaz tiene un solo peer', () => {
    const only = peer('*1', 'WG-ND1', 'A');
    expect(resolvePeer([only], { interfaceName: 'WG-ND1', publicKey: '' })).toEqual({
      peer: only, resolution: 'unique-interface-peer',
    });
  });

  it('no modifica nada si hay varios peers y falta una identidad inequívoca', () => {
    expect(() => resolvePeer([
      peer('*1', 'WG-ND1', 'A'), peer('*2', 'WG-ND1', 'B'),
    ], { interfaceName: 'WG-ND1', publicKey: '' })).toThrow(/2 candidatos/);
  });

  it('falla explícitamente si el peer no existe', () => {
    expect(() => resolvePeer([], { interfaceName: 'WG-ND1', publicKey: '' }))
      .toThrow(/No se encontró/);
  });
});

describe('syncPeerLanAddresses', () => {
  const options = {
    interfaceName: 'WG-ND13-ROSMERYND2',
    publicKey: '',
    peerAddress: '10.11.250.13/32',
    lanSubnets: ['192.168.100.0/24', '192.168.30.0/24'],
  };

  it('agrega redes nuevas, elimina retiradas y verifica RouterOS', async () => {
    const before = peer('*42', options.interfaceName, 'KEY', '10.11.250.13/32,192.168.100.0/24,172.16.9.0/24');
    const after = peer('*42', options.interfaceName, 'KEY', '10.11.250.13/32,192.168.100.0/24,192.168.30.0/24');
    safeWrite
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([after]);

    const result = await syncPeerLanAddresses({}, options);

    expect(result.changed).toBe(true);
    expect(result.resolution).toBe('unique-interface-peer');
    expect(safeWrite).toHaveBeenNthCalledWith(2, {}, [
      '/interface/wireguard/peers/set',
      '=.id=*42',
      '=allowed-address=10.11.250.13/32,192.168.100.0/24,192.168.30.0/24',
    ]);
    expect(sameAddresses(result.actual, options.lanSubnets.concat('10.11.250.13/32'))).toBe(true);
  });

  it('es idempotente y no escribe si las redes ya coinciden aunque cambie el orden', async () => {
    const current = peer('*42', options.interfaceName, 'KEY', '192.168.30.0/24,10.11.250.13/32,192.168.100.0/24');
    safeWrite.mockResolvedValueOnce([current]).mockResolvedValueOnce([current]);

    await expect(syncPeerLanAddresses({}, options)).resolves.toMatchObject({ changed: false });
    expect(safeWrite).toHaveBeenCalledTimes(2);
  });

  it('falla si RouterOS acepta el set pero no confirma la red', async () => {
    const before = peer('*42', options.interfaceName, 'KEY', '10.11.250.13/32,192.168.100.0/24');
    safeWrite
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([before]);

    await expect(syncPeerLanAddresses({}, options)).rejects.toThrow(/no confirmó/i);
  });
});
