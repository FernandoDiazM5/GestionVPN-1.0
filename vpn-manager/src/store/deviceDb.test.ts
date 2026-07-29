import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedDevice } from '../types/devices';

const localStores = vi.hoisted(() => Array.from({ length: 3 }, () => ({
  setItem: vi.fn(async () => undefined),
  getItem: vi.fn(async () => null),
  removeItem: vi.fn(async () => undefined),
  iterate: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
})));

vi.mock('localforage', () => {
  let index = 0;
  return {
    default: {
      createInstance: vi.fn(() => localStores[index++] ?? localStores[0]),
    },
  };
});

import {
  credCache,
  deviceCredentialKeys,
  deviceDb,
  toDevicePersistencePayload,
} from './deviceDb';

const baseDevice: SavedDevice = {
  id: 'F492BF000001',
  mac: 'F4:92:BF:00:00:01',
  ip: '192.168.30.10',
  name: 'AP prueba',
  model: 'LiteAP GPS',
  firmware: 'v8.7.11',
  role: 'ap',
  nodeId: 'node-1',
  nodeName: 'Torre prueba',
  addedAt: 1_700_000_000_000,
};

describe('deviceDb.saveSingle', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStores.forEach(store => Object.values(store).forEach(mock => mock.mockClear()));
    await credCache.clear();
  });

  it('omite los null de AirOS y nunca envía cachedStats al endpoint', async () => {
    const runtimeDevice = {
      ...baseDevice,
      chains: null,
      security: null,
      networkMode: null,
      lanMac: null,
      wlanMac: null,
      apMac: null,
      cachedStats: { chains: null, security: null },
    } as unknown as SavedDevice;

    const payload = toDevicePersistencePayload(runtimeDevice);

    expect(payload).toMatchObject({ id: baseDevice.id, ip: baseDevice.ip });
    expect(payload).not.toHaveProperty('chains');
    expect(payload).not.toHaveProperty('security');
    expect(payload).not.toHaveProperty('networkMode');
    expect(payload).not.toHaveProperty('lanMac');
    expect(payload).not.toHaveProperty('wlanMac');
    expect(payload).not.toHaveProperty('apMac');
    expect(payload).not.toHaveProperty('cachedStats');
  });

  it('propaga HTTP 400 con sus campos y no escribe caché local', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Solicitud rechazada por validación',
        fields: ['body.chains'],
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(deviceDb.saveSingle({
      ...baseDevice,
      cachedStats: { chains: null },
    })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: ['body.chains'],
    });
    expect(localStores[0].setItem).not.toHaveBeenCalled();
  });

  it('confirma el backend antes de guardar las estadísticas locales', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, id: baseDevice.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await deviceDb.saveSingle({
      ...baseDevice,
      cachedStats: { chains: null, security: null },
    });

    const requestInit = fetchSpy.mock.calls[0][1];
    const sent = JSON.parse(String(requestInit?.body));
    expect(sent).not.toHaveProperty('cachedStats');
    expect(localStores[0].setItem).toHaveBeenCalledWith(
      baseDevice.id,
      expect.objectContaining({ stats: expect.any(Object) }),
    );
  });

  it('no elimina cachés locales cuando el backend rechaza el borrado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ success: false, message: 'No se pudo eliminar' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(deviceDb.removeSingle(baseDevice.id)).rejects.toMatchObject({
      status: 500,
      message: 'No se pudo eliminar',
    });
    expect(localStores[0].removeItem).not.toHaveBeenCalled();
  });

  it('elimina cachés locales únicamente después de la confirmación del backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await deviceDb.removeSingle(baseDevice.id);

    expect(localStores[0].removeItem).toHaveBeenCalledWith(baseDevice.id);
  });

  it('propaga el error de carga para que la interfaz no muestre un inventario vacío falso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ success: false, message: 'Base de datos no disponible' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(deviceDb.load()).rejects.toThrow('Base de datos no disponible');
  });

  it('nunca expone sshPass desde la frontera de inventario compartido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        success: true,
        devices: [{ ...baseDevice, sshUser: 'ubnt', sshPass: 'filtrada' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    const inventory = await deviceDb.loadInventory();
    expect(inventory[0]).toMatchObject({ id: baseDevice.id, sshUser: 'ubnt' });
    expect(inventory[0]).not.toHaveProperty('sshPass');
  });

  it('recupera la credencial aunque AirOS cambie entre MAC LAN y WLAN', async () => {
    const identity = {
      ...baseDevice,
      cachedStats: {
        lanMac: 'F4:92:BF:00:00:01',
        wlanMac: 'F4:92:BF:00:00:02',
      },
    };
    await credCache.saveForDevice(identity, 'ubnt', '', 22);

    expect(deviceCredentialKeys(identity)).toEqual(expect.arrayContaining([
      'F492BF000001',
      'F492BF000002',
      '1921683010',
    ]));
    await expect(credCache.get('F4:92:BF:00:00:02')).resolves.toEqual({
      user: 'ubnt',
      pass: '',
      port: 22,
    });
    await credCache.remove(baseDevice.id);
    await expect(credCache.get('F4:92:BF:00:00:02')).resolves.toBeNull();
  });

  it('persiste una contraseña SSH vacía validada en vez de tratarla como ausente', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, id: baseDevice.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await deviceDb.saveSingle({ ...baseDevice, sshUser: 'ubnt', sshPass: '' });

    const requestInit = fetchSpy.mock.calls[0][1];
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      sshUser: 'ubnt',
      sshPass: '',
    });
    await expect(credCache.getForDevice(baseDevice)).resolves.toMatchObject({
      user: 'ubnt',
      pass: '',
    });
  });
});
