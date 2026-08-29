import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const repo = { list: vi.fn(), replace: vi.fn(), listStates: vi.fn(), resolveName: vi.fn() };
const integrations = { getSecret: vi.fn() };
const mikrowisp = { getCatalog: vi.fn() };
stubModule(__dirname, '../../db/repos/externalCatalogRepo', repo);
stubModule(__dirname, '../../lib/workspaceIntegrationService', integrations);
stubModule(__dirname, '../../lib/mikrowispClient', mikrowisp);
const service = require('../../lib/externalCatalogService');

beforeEach(() => {
  vi.clearAllMocks();
  repo.list.mockResolvedValue([]);
  repo.listStates.mockResolvedValue(new Map());
  repo.replace.mockImplementation(async (_ws, _type, entries) => entries);
  integrations.getSecret.mockResolvedValue({ baseUrl: 'https://isp.example.com', token: 'secret' });
  mikrowisp.getCatalog.mockResolvedValue([{ externalId: '2', name: 'Nodo', metadata: {} }]);
});

describe('externalCatalogService', () => {
  it('mantiene cerrado el alcance al único catálogo que interviene con el cliente', () => {
    expect(Object.keys(service.CATALOGS)).toEqual(['ROUTERS']);
  });
  it('sincroniza manualmente un catálogo soportado usando el secreto del mismo workspace', async () => {
    const result = await service.sync('ws-1', 'routers');
    expect(integrations.getSecret).toHaveBeenCalledWith('ws-1', 'MIKROWISP');
    expect(mikrowisp.getCatalog).toHaveBeenCalledWith(expect.objectContaining({ token: 'secret' }), 'ROUTERS');
    expect(repo.replace).toHaveBeenCalledWith('ws-1', 'ROUTERS', expect.any(Array));
    expect(result.entries).toHaveLength(1);
  });

  it('rechaza tipos libres y degrada referencias sin sincronizar', async () => {
    await expect(service.sync('ws-1', 'PLANES')).rejects.toMatchObject({ code: 'EXTERNAL_CATALOG_NOT_SUPPORTED' });
    repo.resolveName.mockResolvedValue(null);
    expect(await service.resolve('ws-1', 'ROUTERS', '99')).toEqual({ externalId: '99', name: 'Pendiente de sincronizar', resolved: false });
  });
});
