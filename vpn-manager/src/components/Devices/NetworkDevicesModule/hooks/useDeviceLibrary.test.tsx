import { act, renderHook, waitFor } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedDevice, ScannedDevice } from '../../../../types/devices';
import type { SshAuthStatus } from '../types';

const deviceDbMock = vi.hoisted(() => ({
  load: vi.fn(async () => []),
  saveSingle: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  removeSingle: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}));

vi.mock('../../../../store/deviceDb', () => ({
  deviceDb: deviceDbMock,
}));

import { useDeviceLibrary } from './useDeviceLibrary';

const device: SavedDevice = {
  id: 'F492BF000002',
  mac: 'F4:92:BF:00:00:02',
  ip: '192.168.30.11',
  name: 'AP transaccional',
  model: 'LiteAP GPS',
  firmware: 'v8.7.11',
  role: 'ap',
  nodeId: 'node-1',
  nodeName: 'Torre prueba',
  cachedStats: { chains: null },
  addedAt: 1_700_000_000_000,
};

function renderLibrary() {
  return renderHook(() => useDeviceLibrary({
    nodesLength: 1,
    setScanResults: vi.fn() as unknown as Dispatch<SetStateAction<ScannedDevice[]>>,
    setSshStatus: vi.fn() as unknown as Dispatch<SetStateAction<Record<string, SshAuthStatus>>>,
    setAddingDevice: vi.fn(),
  }));
}

describe('useDeviceLibrary guardado transaccional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deviceDbMock.load.mockResolvedValue([]);
    deviceDbMock.saveSingle.mockResolvedValue(undefined);
  });

  it('no marca el equipo como guardado mientras el backend sigue pendiente', async () => {
    let confirmSave!: () => void;
    deviceDbMock.saveSingle.mockImplementationOnce(() => new Promise<void>(resolve => {
      confirmSave = resolve;
    }));
    const { result } = renderLibrary();
    await waitFor(() => expect(deviceDbMock.load).toHaveBeenCalled());

    let savePromise!: Promise<boolean>;
    act(() => {
      savePromise = result.current.handleAddDevice(device);
    });

    expect(result.current.savedIds.has(device.id)).toBe(false);
    expect(result.current.savedDevices).toHaveLength(0);
    expect(result.current.savingIds.has(device.id)).toBe(true);

    await act(async () => {
      confirmSave();
      await savePromise;
    });

    expect(result.current.savedIds.has(device.id)).toBe(true);
    expect(result.current.savedDevices).toContainEqual(device);
    expect(result.current.savingIds.has(device.id)).toBe(false);
  });

  it('mantiene el equipo sin guardar y muestra el error cuando el backend rechaza', async () => {
    const apiError = Object.assign(new Error('Solicitud rechazada por validación'), {
      status: 400,
      fields: ['body.chains'],
    });
    deviceDbMock.saveSingle.mockRejectedValueOnce(apiError);
    const { result } = renderLibrary();
    await waitFor(() => expect(deviceDbMock.load).toHaveBeenCalled());

    let savedOk = true;
    await act(async () => {
      savedOk = await result.current.handleAddDevice(device);
    });

    expect(savedOk).toBe(false);
    expect(result.current.savedIds.has(device.id)).toBe(false);
    expect(result.current.savedDevices).toHaveLength(0);
    expect(result.current.savingIds.has(device.id)).toBe(false);
    expect(result.current.toast).toContain('Solicitud rechazada por validación');
  });
});
