/**
 * cpeCache — almacenamiento local (IndexedDB via localforage) para CPEs
 * extraídos del wstalist de cada AP. Se persiste en el browser sin tocar
 * la base de datos SQLite del servidor.
 */
import localforage from 'localforage';
import type { SavedDevice } from '../types/devices';

const store = localforage.createInstance({
  name:        'MikroTikVPNManager',
  storeName:   'topology_cpes',
  description: 'CPEs extraídos de wstalist — persistencia local del browser',
});

export const cpeCache = {
  /** Carga todos los CPEs guardados en IndexedDB */
  async load(): Promise<SavedDevice[]> {
    const keys  = await store.keys();
    const items = await Promise.all(keys.map(k => store.getItem<SavedDevice>(k)));
    return items.filter((x): x is SavedDevice => x !== null);
  },

  /** Guarda/actualiza un CPE por su id (MAC sin separadores) */
  async upsert(cpe: SavedDevice): Promise<void> {
    await store.setItem(cpe.id, cpe);
  },

  /** Guarda múltiples CPEs en paralelo */
  async upsertMany(cpes: SavedDevice[]): Promise<void> {
    await Promise.allSettled(cpes.map(c => store.setItem(c.id, c)));
  },

  /** Elimina un CPE por id */
  async remove(id: string): Promise<void> {
    await store.removeItem(id);
  },

  /** Elimina CPEs por lista de IDs de devices/APs */
  async removeByDeviceIds(deviceIds: string[]): Promise<void> {
    if (!deviceIds.length) return;
    const keys = await store.keys();
    const items = await Promise.all(keys.map(async k => {
      const item = await store.getItem<SavedDevice>(k);
      return item && deviceIds.includes(item.id) ? k : null;
    }));
    await Promise.allSettled(items.filter(Boolean).map(k => store.removeItem(k!)));
  },

  /** Borra todos los CPEs del store */
  async clear(): Promise<void> {
    await store.clear();
  },
};
