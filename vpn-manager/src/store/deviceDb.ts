import { API_BASE_URL } from '../config';
import type { SavedDevice } from '../types/devices';

export const deviceDb = {
  async load(): Promise<SavedDevice[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/db/devices`);
      const data = await res.json();
      if (data.success && data.devices) return data.devices;
      return [];
    } catch (err) {
      console.error('Error cargando devices de SQLite:', err);
      return [];
    }
  },

  async saveSingle(device: SavedDevice): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/db/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(device),
      });
    } catch (err) {
      console.error('Error guardando device:', err);
    }
  },

  async removeSingle(id: string): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/db/devices/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Error eliminando device:', err);
    }
  },
};
