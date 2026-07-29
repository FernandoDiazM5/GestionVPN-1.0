import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../types/account';
import type { NodeInfo } from '../types/api';

const mocks = vi.hoisted(() => ({
  session: {
    id: 'user-1',
    email: 'owner@example.com',
    role: 'OWNER',
    workspace_id: 'workspace-1',
  } as SessionUser,
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../context/WorkspaceSession', () => ({
  useWorkspaceSession: () => ({ session: mocks.session }),
}));
vi.mock('../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

import {
  nodeInventoryKey,
  useNodeInventory,
  useNodeInventoryCache,
} from './nodeInventory';

const node: NodeInfo = {
  id: 'node-1',
  nombre_nodo: 'Sitio Uno',
  ppp_user: 'site-user',
  segmento_lan: '192.168.10.0/24',
  nombre_vrf: 'VRF-SITIO-1',
  service: 'wireguard',
  disabled: false,
  running: true,
  ip_tunnel: '10.0.0.2',
  uptime: '1h',
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('nodeInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [node],
    });
  });

  it('deduplica consumidores simultáneos dentro del mismo ámbito', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => ({
      first: useNodeInventory(),
      second: useNodeInventory(),
    }), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.first.data).toEqual([node]));
    expect(result.current.second.data).toEqual([node]);
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('mantiene las ediciones y eliminaciones sincronizadas en la caché', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => ({
      inventory: useNodeInventory(),
      cache: useNodeInventoryCache(),
    }), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.inventory.data).toEqual([node]));

    act(() => result.current.cache.update(node.ppp_user, { nombre_nodo: 'Sitio Renombrado' }));
    expect(queryClient.getQueryData<NodeInfo[]>(nodeInventoryKey(mocks.session))?.[0].nombre_nodo)
      .toBe('Sitio Renombrado');

    act(() => result.current.cache.remove(node.ppp_user));
    expect(queryClient.getQueryData<NodeInfo[]>(nodeInventoryKey(mocks.session))).toEqual([]);
  });

  it('segmenta la clave por workspace, usuario, rol y alcance', () => {
    expect(nodeInventoryKey({ ...mocks.session, id: 'user-2' }))
      .not.toEqual(nodeInventoryKey(mocks.session));
    expect(nodeInventoryKey({ ...mocks.session, workspace_id: 'workspace-2' }))
      .not.toEqual(nodeInventoryKey(mocks.session));
    expect(nodeInventoryKey({ ...mocks.session, platform_admin: true }))
      .not.toEqual(nodeInventoryKey(mocks.session));
  });
});
