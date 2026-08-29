import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listMikrowispCatalogs: vi.fn(), syncMikrowispCatalog: vi.fn() }));
vi.mock('../../../../services/integrationsApi', () => ({ integrationsApi: api }));
import MikrowispCatalogs from './MikrowispCatalogs';

beforeEach(() => {
  vi.clearAllMocks();
  api.listMikrowispCatalogs.mockResolvedValue({ catalogs: [
    { type: 'ROUTERS', label: 'Routers y nodos', count: 0, lastSyncedAt: null },
    { type: 'MONITORING_EQUIPMENT', label: 'Equipos monitoreados', count: 0, lastSyncedAt: null },
    { type: 'NAP_BOXES', label: 'Cajas NAP', count: 0, lastSyncedAt: null },
  ] });
});

describe('MikrowispCatalogs', () => {
  it('explica el fallback y lista únicamente catálogos oficiales', async () => {
    render(<MikrowispCatalogs />);
    expect(await screen.findByText('Routers y nodos')).toBeInTheDocument();
    expect(screen.getByText('Equipos monitoreados')).toBeInTheDocument();
    expect(screen.getByText('Cajas NAP')).toBeInTheDocument();
    expect(screen.getByText(/Pendiente de sincronizar/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sincronizar ahora' })).toHaveLength(3);
  });

  it('sincroniza manualmente el tipo seleccionado y actualiza el conteo', async () => {
    const user = userEvent.setup();
    api.syncMikrowispCatalog.mockResolvedValue({ catalog: { type: 'ROUTERS', label: 'Routers y nodos', entries: [
      { type: 'ROUTERS', externalId: '2', name: 'Nodo', metadata: {}, lastSyncedAt: 100 },
    ] } });
    render(<MikrowispCatalogs />);
    await user.click((await screen.findAllByRole('button', { name: 'Sincronizar ahora' }))[0]);
    await waitFor(() => expect(api.syncMikrowispCatalog).toHaveBeenCalledWith('ROUTERS'));
    expect(await screen.findByText(/1 registros sincronizados/)).toBeInTheDocument();
  });
});
