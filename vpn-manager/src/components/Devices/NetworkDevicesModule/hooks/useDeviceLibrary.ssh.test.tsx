import { act, renderHook, waitFor } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeInfo } from '../../../../types/api';
import type { SavedDevice, ScannedDevice } from '../../../../types/devices';
import type { SshAuthStatus } from '../types';

const mocks = vi.hoisted(() => ({
  load: vi.fn(async (): Promise<SavedDevice[]> => []),
  saveSingle: vi.fn(async () => undefined),
  getForDevice: vi.fn(async () => null as { user: string; pass: string; port: number } | null),
}));

vi.mock('../../../../store/deviceDb', () => ({
  deviceDb: {
    load: mocks.load,
    saveSingle: mocks.saveSingle,
  },
  credCache: {
    getForDevice: mocks.getForDevice,
  },
}));

import { useDeviceLibrary } from './useDeviceLibrary';

const scanned: ScannedDevice = {
  ip: '192.168.30.11',
  mac: 'F4:92:BF:00:00:02',
  name: 'AP restaurado',
  model: 'LiteAP GPS',
  firmware: 'v8.7.11',
  role: 'ap',
  sshUser: 'ubnt',
  cachedStats: { deviceName: 'AP restaurado' },
};
const node = {
  id: 'node-1',
  nombre_nodo: 'Torre prueba',
  segmento_lan: '192.168.30.0/24',
} as NodeInfo;

function renderLibrary(setAddingDevice = vi.fn()) {
  return {
    setAddingDevice,
    ...renderHook(() => useDeviceLibrary({
      nodesLength: 1,
      setScanResults: vi.fn() as unknown as Dispatch<SetStateAction<ScannedDevice[]>>,
      setSshStatus: vi.fn() as unknown as Dispatch<SetStateAction<Record<string, SshAuthStatus>>>,
      setAddingDevice,
    })),
  };
}

describe('guardado SSH después de restaurar un escaneo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue([]);
    mocks.saveSingle.mockResolvedValue(undefined);
    mocks.getForDevice.mockResolvedValue(null);
  });

  it('abre confirmación y no persiste si la clave ya no está en memoria', async () => {
    const { result, setAddingDevice } = renderLibrary();
    await waitFor(() => expect(mocks.load).toHaveBeenCalled());

    let saved = true;
    await act(async () => { saved = await result.current.handleDirectSave(scanned, node); });

    expect(saved).toBe(false);
    expect(mocks.saveSingle).not.toHaveBeenCalled();
    expect(setAddingDevice).toHaveBeenCalledWith(scanned);
    expect(result.current.toast).toContain('ya no conserva la clave SSH');
  });

  it('recupera una clave por alias y la persiste antes de confirmar el guardado', async () => {
    mocks.getForDevice.mockResolvedValue({ user: 'ubnt', pass: 'recuperada', port: 22 });
    const { result } = renderLibrary();
    await waitFor(() => expect(mocks.load).toHaveBeenCalled());

    let saved = false;
    await act(async () => { saved = await result.current.handleDirectSave(scanned, node); });

    expect(saved).toBe(true);
    expect(mocks.saveSingle).toHaveBeenCalledWith(expect.objectContaining({
      sshUser: 'ubnt',
      sshPass: 'recuperada',
    }));
  });
});
