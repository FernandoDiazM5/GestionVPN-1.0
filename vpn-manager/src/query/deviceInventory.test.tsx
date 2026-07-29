import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../types/account';
import type { SavedDevice } from '../types/devices';

const mocks = vi.hoisted(() => ({
  session: {
    id: 'user-1',
    email: 'owner@example.com',
    role: 'OWNER',
    workspace_id: 'workspace-1',
  } as SessionUser,
  loadInventory: vi.fn<() => Promise<SavedDevice[]>>(),
}));

vi.mock('../context/WorkspaceSession', () => ({
  useWorkspaceSession: () => ({ session: mocks.session }),
}));
vi.mock('../store/deviceDb', () => ({
  deviceDb: { loadInventory: mocks.loadInventory },
}));

import {
  deviceInventoryKey,
  useDeviceInventory,
  useDeviceInventoryCache,
} from './deviceInventory';

const device: SavedDevice = {
  id: 'AP-1',
  mac: '00:11:22:33:44:55',
  ip: '10.1.1.2',
  name: 'Antena',
  model: 'LiteAP',
  firmware: '1.0',
  role: 'ap',
  nodeId: 'node-1',
  nodeName: 'Sitio 1',
  addedAt: 1,
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('deviceInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadInventory.mockResolvedValue([device]);
  });

  it('deduplica consumidores simultáneos dentro del mismo ámbito', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => ({
      first: useDeviceInventory(),
      second: useDeviceInventory(),
    }), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.first.data).toEqual([device]));
    expect(result.current.second.data).toEqual([device]);
    expect(mocks.loadInventory).toHaveBeenCalledTimes(1);
  });

  it('elimina sshPass antes de escribir una mutación en la caché compartida', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => ({
      inventory: useDeviceInventory(),
      cache: useDeviceInventoryCache(),
    }), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(result.current.inventory.data).toEqual([device]));

    act(() => {
      result.current.cache.upsert({ ...device, sshUser: 'ubnt', sshPass: 'secreto' });
    });

    const cached = queryClient.getQueryData<SavedDevice[]>(deviceInventoryKey(mocks.session));
    expect(cached?.[0]).toMatchObject({ id: device.id, sshUser: 'ubnt' });
    expect(cached?.[0]).not.toHaveProperty('sshPass');
  });

  it('segmenta la clave por workspace, usuario, rol y alcance', () => {
    const otherUser = { ...mocks.session, id: 'user-2' };
    const otherWorkspace = { ...mocks.session, workspace_id: 'workspace-2' };
    const platform = { ...mocks.session, platform_admin: true };

    expect(deviceInventoryKey(otherUser)).not.toEqual(deviceInventoryKey(mocks.session));
    expect(deviceInventoryKey(otherWorkspace)).not.toEqual(deviceInventoryKey(mocks.session));
    expect(deviceInventoryKey(platform)).not.toEqual(deviceInventoryKey(mocks.session));
  });
});
