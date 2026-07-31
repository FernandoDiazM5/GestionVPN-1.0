const safeWrite = vi.fn();
const writeIdempotent = vi.fn();
const { stubModule } = require('../helpers/moduleMock');
stubModule(__dirname, '../../routeros.service', { safeWrite, writeIdempotent });

const { ensureTowerEntries, ensureRoute, removeRoutesForVrf } = require('../../lib/remoteNetworkSync');

describe('lib/remoteNetworkSync', () => {
  beforeEach(() => { safeWrite.mockReset(); writeIdempotent.mockReset(); });

  it('deduplica address-list incluso con redes equivalentes', async () => {
    safeWrite.mockResolvedValue([{ list: 'LIST-NET-REMOTE-TOWERS', address: '10.0.0.0/24' }]);
    expect(await ensureTowerEntries({}, ['10.0.0.9/24', '172.16.1.0/24'], 'LAN X'))
      .toEqual(['172.16.1.0/24']);
    expect(writeIdempotent).toHaveBeenCalledTimes(1);
  });

  it('serializa altas concurrentes para evitar dos inserciones iguales', async () => {
    const existing = [];
    safeWrite.mockImplementation(async () => [...existing]);
    writeIdempotent.mockImplementation(async (_api, command) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      existing.push({ list: 'LIST-NET-REMOTE-TOWERS', address: command[2].slice('=address='.length) });
    });
    await Promise.all([
      ensureTowerEntries({}, ['172.16.1.0/24'], 'LAN A'),
      ensureTowerEntries({}, ['172.16.1.0/24'], 'LAN B'),
    ]);
    expect(writeIdempotent).toHaveBeenCalledTimes(1);
  });

  it('no duplica rutas existentes', async () => {
    safeWrite.mockResolvedValue([{ 'dst-address': '10.0.0.0/24', 'routing-table': 'VRF-X' }]);
    expect(await ensureRoute({}, { dst: '10.0.0.7/24', gateway: 'WG@VRF-X', routingTable: 'VRF-X' }))
      .toBe(false);
    expect(writeIdempotent).not.toHaveBeenCalled();
  });

  it('al retirar una red elimina solo rutas del VRF y nunca la lista global', async () => {
    safeWrite.mockResolvedValueOnce([
      { '.id': '*1', 'dst-address': '10.0.0.0/24', 'routing-table': 'VRF-X' },
      { '.id': '*2', 'dst-address': '10.0.0.0/24', 'routing-table': 'VRF-Y' },
    ]).mockResolvedValue([]);
    expect(await removeRoutesForVrf({}, 'VRF-X', ['10.0.0.9/24'])).toEqual(['10.0.0.0/24']);
    expect(safeWrite).toHaveBeenCalledWith({}, ['/ip/route/remove', '=.id=*1']);
    expect(safeWrite.mock.calls.flat(2).join(' ')).not.toContain('address-list/remove');
  });
});
