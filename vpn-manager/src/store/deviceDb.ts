import localforage from 'localforage';
import type { SavedDevice } from '../types/devices';

// Instancia separada para dispositivos (no mezclar con la del VPN store)
const deviceStore = localforage.createInstance({
  name: 'MikroTikVPNManager',
  storeName: 'network_devices',
  description: 'Dispositivos Ubiquiti descubiertos y guardados',
});

const DEVICES_KEY = 'saved_devices_v1';

export const deviceDb = {
  async load(): Promise<SavedDevice[]> {
    try {
      const data = await deviceStore.getItem<SavedDevice[]>(DEVICES_KEY);
      return data ?? [];
    } catch {
      return [];
    }
  },

  async save(devices: SavedDevice[]): Promise<void> {
    await deviceStore.setItem(DEVICES_KEY, devices);
  },

  async clear(): Promise<void> {
    await deviceStore.removeItem(DEVICES_KEY);
  },
};
