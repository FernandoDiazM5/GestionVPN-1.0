import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
const txQuery = vi.fn();
stubModule(__dirname, '../../db/mysql', { query, withTransaction: vi.fn(async callback => callback({ query: txQuery })) });
const repo = require('../../db/repos/externalCatalogRepo');

beforeEach(() => { vi.clearAllMocks(); query.mockResolvedValue([]); txQuery.mockResolvedValue({ affectedRows: 1 }); });

describe('externalCatalogRepo', () => {
  it('reemplaza un tipo de catálogo de forma transaccional y aislada', async () => {
    await repo.replace('ws-1', 'ROUTERS', [{ externalId: '2', name: 'Nodo', metadata: { status: 'UP' } }], 100);
    expect(txQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('DELETE FROM external_catalog_entries'), ['ws-1', 'ROUTERS']);
    expect(txQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO external_catalog_entries'), ['ws-1', 'ROUTERS', '2', 'Nodo', '{"status":"UP"}', 100]);
    expect(txQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO external_catalog_sync_state'), ['ws-1', 'ROUTERS', 1, 100]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('workspace_id=? AND catalog_type=?'), ['ws-1', 'ROUTERS']);
  });

  it('conserva fecha y conteo incluso cuando el catálogo sincronizado queda vacío', async () => {
    await repo.replace('ws-1', 'NAP_BOXES', [], 200);
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('external_catalog_sync_state'), ['ws-1', 'NAP_BOXES', 0, 200]);
  });

  it('devuelve sólo la forma pública y resuelve nombres sin romper por faltantes', async () => {
    query.mockResolvedValueOnce([{ catalog_type: 'ROUTERS', external_id: '2', display_name: 'Nodo', metadata_json: '{"status":"UP"}', last_synced_at: 100 }]);
    expect(await repo.list('ws-1', 'ROUTERS')).toEqual([{ type: 'ROUTERS', externalId: '2', name: 'Nodo', metadata: { status: 'UP' }, lastSyncedAt: 100 }]);
    query.mockResolvedValueOnce([]);
    expect(await repo.resolveName('ws-1', 'ROUTERS', '99')).toBeNull();
  });
});
