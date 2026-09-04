import { describe, it, expect, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');
const integrations = { listMikrowispClients: vi.fn() };
const catalog = { list: vi.fn(), replace: vi.fn() };
stubModule(__dirname, '../../lib/workspaceIntegrationService', integrations);
stubModule(__dirname, '../../db/repos/externalCatalogRepo', catalog);
const snapshots = require('../../lib/mikrowispClientSnapshot');
describe('copia local de clientes MikroWisp', () => {
  it('deduplica importaciones concurrentes y sólo guarda ID y nombre', async () => {
    integrations.listMikrowispClients.mockResolvedValue([{ id: '1', name: 'Ana', email: 'private', services: [{ password: 'secret' }] }]);
    catalog.replace.mockResolvedValue([]);
    const first = snapshots.sync('ws-a');
    const second = snapshots.sync('ws-a');
    expect(first).toBe(second);
    await first;
    expect(integrations.listMikrowispClients).toHaveBeenCalledTimes(1);
    expect(catalog.replace).toHaveBeenCalledWith('ws-a', 'TELEGRAM_CLIENTS', [{ externalId: '1', name: 'Ana' }]);
    expect(() => snapshots.sync('ws-a')).toThrow(/Espera un minuto/);
  });
  it('conserva la copia anterior cuando falla la lectura externa', async () => {
    catalog.replace.mockClear();
    integrations.listMikrowispClients.mockRejectedValue(new Error('timeout'));
    await expect(snapshots.sync('ws-b')).rejects.toThrow('timeout');
    expect(catalog.replace).not.toHaveBeenCalled();
  });
  it('lee exclusivamente la copia del workspace solicitado', async () => {
    catalog.list.mockResolvedValue([{ externalId: '2', name: 'Luis', metadata: {} }]);
    expect(await snapshots.read('ws-c')).toEqual([{ id: '2', name: 'Luis' }]);
    expect(catalog.list).toHaveBeenCalledWith('ws-c', 'TELEGRAM_CLIENTS');
  });
});
