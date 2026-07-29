import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedDevice } from '../../../../types/devices';

const mocks = vi.hoisted(() => ({
  data: [] as SavedDevice[],
  error: null as Error | null,
  refetch: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../../../query/deviceInventory', () => ({
  useDeviceInventory: () => ({
    data: mocks.data,
    error: mocks.error,
    refetch: mocks.refetch,
  }),
  useDeviceInventoryCache: () => ({
    upsert: mocks.upsert,
    remove: mocks.remove,
  }),
}));
vi.mock('../../../../store/deviceDb', () => ({
  deviceDb: {
    saveSingle: vi.fn(),
    removeSingle: vi.fn(),
  },
}));

import { useApMonitorLogic } from './useApMonitorLogic';

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

describe('useApMonitorLogic con inventario compartido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = [device];
    mocks.error = null;
    mocks.refetch.mockResolvedValue({ data: [device], error: null });
  });

  it('conserva datos anteriores y muestra aviso si falla una revalidación', async () => {
    mocks.error = new Error('Conexión temporalmente no disponible');
    const { result } = renderHook(() => useApMonitorLogic([], null));

    await waitFor(() => expect(result.current.devices).toEqual([device]));
    expect(result.current.loadError).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.toast).toEqual({
      msg: 'Conexión temporalmente no disponible',
      type: 'error',
    });
  });
});

