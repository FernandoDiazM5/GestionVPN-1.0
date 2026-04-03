import localforage from 'localforage';
import { API_BASE_URL } from '../config';
import type { SavedDevice, AntennaStats } from '../types/devices';
import { apiFetch } from '../utils/apiClient';

// ── Store separado de IndexedDB para diagnóstico completo de antenas ──────
// NO viaja al servidor. Solo vive en el navegador.
const statsStore = localforage.createInstance({
  name: 'MikroTikVPNManager',
  storeName: 'antenna_stats_cache',
  description: 'Cache de diagnóstico completo por antena (mca-status, meminfo, routes, etc.)',
});

// ── Credentials Cache (IndexedDB local) ──────────────────────────────────
// Guarda credenciales SSH que funcionaron durante el escaneo.
// NO viaja al servidor. Solo vive en el navegador (se persiste entre recargas).
const credStore = localforage.createInstance({
  name: 'MikroTikVPNManager',
  storeName: 'device_credentials_cache',
  description: 'Cache de credenciales SSH validadas por dispositivo',
});

export const credCache = {
  async save(deviceId: string, user: string, pass: string, port?: number): Promise<void> {
    try {
      await credStore.setItem(deviceId, { user, pass, port: port ?? 22 });
    } catch (err) {
      console.error('[CredCache] Error guardando credenciales:', err);
    }
  },

  async get(deviceId: string): Promise<{ user: string; pass: string; port: number } | null> {
    try {
      return await credStore.getItem(deviceId);
    } catch {
      return null;
    }
  },

  async remove(deviceId: string): Promise<void> {
    try {
      await credStore.removeItem(deviceId);
    } catch { /* ignore */ }
  },

  async getAll(): Promise<Record<string, { user: string; pass: string; port: number }>> {
    const result: Record<string, { user: string; pass: string; port: number }> = {};
    try {
      await credStore.iterate((value, key) => {
        result[key] = value as { user: string; pass: string; port: number };
      });
    } catch { /* ignore */ }
    return result;
  },
};

// ── Stats Cache (IndexedDB local) ─────────────────────────────────────────
export const statsCache = {
  /** Guarda el objeto AntennaStats completo (todo lo que devuelve el botón Estado) */
  async save(deviceId: string, stats: AntennaStats): Promise<void> {
    try {
      await statsStore.setItem(deviceId, {
        stats,
        savedAt: Date.now(),
      });
    } catch (err) {
      console.error('[StatsCache] Error guardando stats:', err);
    }
  },

  /** Lee las stats completas de una antena por ID (MAC sin separadores) */
  async get(deviceId: string): Promise<{ stats: AntennaStats; savedAt: number } | null> {
    try {
      return await statsStore.getItem(deviceId);
    } catch {
      return null;
    }
  },

  /** Elimina el caché de una antena */
  async remove(deviceId: string): Promise<void> {
    try {
      await statsStore.removeItem(deviceId);
    } catch { /* ignore */ }
  },

  /** Carga todos los IDs con caché disponible (para mostrar indicador visual) */
  async getAll(): Promise<Record<string, { stats: AntennaStats; savedAt: number }>> {
    const result: Record<string, { stats: AntennaStats; savedAt: number }> = {};
    try {
      await statsStore.iterate((value, key) => {
        result[key] = value as { stats: AntennaStats; savedAt: number };
      });
    } catch { /* ignore */ }
    return result;
  },
};

// ── Esqueleto SQLite (Backend) ────────────────────────────────────────────
// Extrae SOLO los campos estáticos relevantes — nunca envía cachedStats al servidor.
function toSQLiteSkeleton(device: SavedDevice): Omit<SavedDevice, 'cachedStats'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cachedStats, ...skeleton } = device;
  return skeleton;
}

export const deviceDb = {
  async load(): Promise<SavedDevice[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/db/devices`);
      const data = await res.json();
      if (data.success && data.devices) {
        // Enriquecer con cachedStats del store local si está disponible
        const allStats = await statsCache.getAll();
        return data.devices.map((d: SavedDevice) => ({
          ...d,
          cachedStats: allStats[d.id]?.stats ?? undefined,
        }));
      }
      return [];
    } catch (err) {
      console.error('Error cargando devices de SQLite:', err);
      return [];
    }
  },

  async saveSingle(device: SavedDevice): Promise<void> {
    try {
      // 1. Guardar stats COMPLETAS en IndexedDB (sin filtro)
      if (device.cachedStats) {
        await statsCache.save(device.id, device.cachedStats);
      }

      // 2. Enviar SOLO el esqueleto estático a SQLite via backend
      const skeleton = toSQLiteSkeleton(device);
      await apiFetch(`${API_BASE_URL}/api/db/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skeleton),
      });
    } catch (err) {
      console.error('Error guardando device:', err);
    }
  },

  async removeSingle(id: string): Promise<void> {
    try {
      await Promise.all([
        apiFetch(`${API_BASE_URL}/api/db/devices/${id}`, { method: 'DELETE' }),
        statsCache.remove(id),
      ]);
    } catch (err) {
      console.error('Error eliminando device:', err);
    }
  },

  async removeByIds(ids: string[]): Promise<void> {
    await Promise.allSettled([
      ...ids.map(id => apiFetch(`${API_BASE_URL}/api/db/devices/${id}`, { method: 'DELETE' })),
      ...ids.map(id => statsCache.remove(id)),
    ]);
  },

  async cleanupOrphans(): Promise<number> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/db/cleanup-orphan-devices`, { method: 'POST' });
      const data = await res.json();
      if (data.success && Array.isArray(data.orphanIds)) {
        await Promise.allSettled(data.orphanIds.map((id: string) => statsCache.remove(id)));
      }
      return typeof data.devicesDeleted === 'number' ? data.devicesDeleted : 0;
    } catch (err) {
      console.error('Error limpiando devices huérfanos:', err);
      return 0;
    }
  },
};
