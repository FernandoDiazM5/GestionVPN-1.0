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

// ── Credentials Cache (memoria de la pestaña) ────────────────────────────
// Las credenciales SSH validadas viven sólo en memoria durante esta pestaña.
//
// Al guardar el equipo, la clave viaja al backend y se cifra en aps.clave_ssh_enc.
const legacyCredStore = localforage.createInstance({
  name: 'MikroTikVPNManager',
  storeName: 'device_credentials_cache',
});
const legacyKeyStore = localforage.createInstance({
  name: 'MikroTikVPNManager',
  storeName: 'key_store',
});
type MemoryCred = { user: string; pass: string; port: number };
const memoryCredentials = new Map<string, MemoryCred>();

// Purga best-effort de las credenciales cifradas y su llave de versiones previas.
void Promise.allSettled([legacyCredStore.clear(), legacyKeyStore.clear()]);

export const credCache = {
  async save(deviceId: string, user: string, pass: string, port?: number): Promise<void> {
    memoryCredentials.set(deviceId, { user, pass, port: port ?? 22 });
  },

  async get(deviceId: string): Promise<{ user: string; pass: string; port: number } | null> {
    return memoryCredentials.get(deviceId) ?? null;
  },

  async remove(deviceId: string): Promise<void> {
    memoryCredentials.delete(deviceId);
  },

  async clear() { memoryCredentials.clear(); },
  async getAll(): Promise<Record<string, { user: string; pass: string; port: number }>> {
    return Object.fromEntries(memoryCredentials.entries());
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

  async clear() { try { await statsStore.clear(); } catch { /* ignore */ } },
};

// ── Esqueleto SQLite (Backend) ────────────────────────────────────────────
// Extrae SOLO los campos estáticos relevantes — nunca envía cachedStats al servidor.
function toSQLiteSkeleton(device: SavedDevice): Omit<SavedDevice, 'cachedStats'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cachedStats, ...skeleton } = device;
  return skeleton;
}

// Backfill: re-empuja al backend las claves SSH que siguen en memoria
// pero AUSENTES en la tabla aps (`hasSshPass=false`). Cubre APs guardados antes de
// que saveSingle garantizara la propagación de la clave → Monitor AP (que lee del
// backend) deja de mostrarlos "Sin SSH". Usa PUT PARCIAL (solo toca usuario_ssh/
// clave_ssh_enc/puerto_ssh; nunca pisa hostname/modelo/etc.). Best-effort, F&F.
async function backfillBackendCreds(
  backendDevices: Array<SavedDevice & { hasSshPass?: boolean }>,
  allCreds: Record<string, { user: string; pass: string; port?: number } | undefined>,
): Promise<void> {
  const pending = backendDevices.filter(d => !d.hasSshPass && allCreds[d.id]?.pass);
  for (const d of pending) {
    const cred = allCreds[d.id]!;
    try {
      await apiFetch(`${API_BASE_URL}/api/db/devices/${d.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sshUser: d.sshUser || cred.user,
          sshPass: cred.pass,
          sshPort: d.sshPort || cred.port || 22,
        }),
      });
    } catch { /* best-effort: se reintenta en la próxima carga */ }
  }
}

export const deviceDb = {
  async load(): Promise<SavedDevice[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/db/devices`);
      const data = await res.json();
      if (data.success && data.devices) {
        // Enriquecer con stats persistidas y credenciales efímeras de esta sesión
        const [allStats, allCreds] = await Promise.all([
          statsCache.getAll(),
          credCache.getAll(),
        ]);
        const enriched = data.devices.map((d: SavedDevice) => {
          const cred = allCreds[d.id];
          return {
            ...d,
            cachedStats: allStats[d.id]?.stats ?? undefined,
            // Si hay credenciales en memoria, usarlas durante esta pestaña.
            sshUser: d.sshUser || cred?.user,
            sshPass: cred?.pass ?? undefined,
            sshPort: d.sshPort || cred?.port,
          };
        });
        // Cura APs que el backend tiene "Sin SSH" pero credCache sí conoce (F&F).
        void backfillBackendCreds(
          data.devices as Array<SavedDevice & { hasSshPass?: boolean }>,
          allCreds,
        );
        return enriched;
      }
      return [];
    } catch (err) {
      console.error('Error cargando devices de SQLite:', err);
      return [];
    }
  },

  async saveSingle(device: SavedDevice): Promise<void> {
    try {
      // Guardrail: el bug §51 mostró que un caller podía pasar `undefined` si
      // intentaba leer una variable que dependía de un setState con functional
      // updater (que React no procesa sincrónicamente). El fix raíz vive en el
      // caller; este check evita el crash si una regresión similar reaparece.
      if (!device || !device.id) {
        console.warn('deviceDb.saveSingle: device sin id — ignorado', device);
        return;
      }
      // 1. Guardar stats COMPLETAS en IndexedDB (sin filtro)
      if (device.cachedStats) {
        await statsCache.save(device.id, device.cachedStats);
      }

      // 2. Garantizar que la clave SSH llegue al BACKEND (aps.clave_ssh_enc): si el
      //    device perdió sshPass en memoria (p.ej. tras F5/re-login, que la borra de
      //    sessionStorage por seguridad) la recuperamos de credCache. Así Monitor AP
      //    —que lee la clave del backend, NO de credCache— siempre la tiene.
      let toSave = device;
      if (!device.sshPass) {
        const cred = await credCache.get(device.id);
        if (cred?.pass) {
          toSave = {
            ...device,
            sshUser: device.sshUser || cred.user,
            sshPass: cred.pass,
            sshPort: device.sshPort ?? cred.port,
          };
        }
      }

      // 3. Conservar temporalmente las credenciales SSH en memoria.
      if (toSave.sshUser && toSave.sshPass) {
        await credCache.save(toSave.id, toSave.sshUser, toSave.sshPass, toSave.sshPort);
      }

      // 4. Enviar el esqueleto estático a SQLite via backend (con la clave incluida)
      const skeleton = toSQLiteSkeleton(toSave);
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
        credCache.remove(id),
      ]);
    } catch (err) {
      console.error('Error eliminando device:', err);
    }
  },

  async removeByIds(ids: string[]): Promise<void> {
    await Promise.allSettled([
      ...ids.map(id => apiFetch(`${API_BASE_URL}/api/db/devices/${id}`, { method: 'DELETE' })),
      ...ids.map(id => statsCache.remove(id)),
      ...ids.map(id => credCache.remove(id)),
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
