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

type CredentialIdentity = Pick<SavedDevice, 'id' | 'ip' | 'mac'> & {
  cachedStats?: Pick<AntennaStats, 'lanMac' | 'wlanMac'>;
};

function normalizeCredentialKey(value?: string): string {
  return (value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function deviceCredentialKeys(device: Partial<CredentialIdentity>): string[] {
  return [...new Set([
    normalizeCredentialKey(device.id),
    normalizeCredentialKey(device.mac),
    normalizeCredentialKey(device.cachedStats?.lanMac ?? undefined),
    normalizeCredentialKey(device.cachedStats?.wlanMac ?? undefined),
    normalizeCredentialKey(device.ip),
  ].filter(Boolean))];
}

// Purga best-effort de las credenciales cifradas y su llave de versiones previas.
void Promise.allSettled([legacyCredStore.clear(), legacyKeyStore.clear()]);

export const credCache = {
  async save(deviceId: string, user: string, pass: string, port?: number): Promise<void> {
    memoryCredentials.set(normalizeCredentialKey(deviceId), { user, pass, port: port ?? 22 });
  },

  async get(deviceId: string): Promise<{ user: string; pass: string; port: number } | null> {
    return memoryCredentials.get(normalizeCredentialKey(deviceId)) ?? null;
  },

  async saveForDevice(device: Partial<CredentialIdentity>, user: string, pass: string, port?: number): Promise<void> {
    const cred = { user, pass, port: port ?? 22 };
    deviceCredentialKeys(device).forEach(key => memoryCredentials.set(key, cred));
  },

  async getForDevice(device: Partial<CredentialIdentity>): Promise<MemoryCred | null> {
    for (const key of deviceCredentialKeys(device)) {
      const credential = memoryCredentials.get(key);
      if (credential) return credential;
    }
    return null;
  },

  async remove(deviceId: string): Promise<void> {
    const key = normalizeCredentialKey(deviceId);
    const credential = memoryCredentials.get(key);
    if (!credential) return;
    for (const [storedKey, storedCredential] of memoryCredentials) {
      if (storedCredential === credential) memoryCredentials.delete(storedKey);
    }
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
export type DevicePersistencePayload = Omit<SavedDevice, 'cachedStats' | 'lastStatsAt'>;

export interface DevicePersistenceError extends Error {
  status: number;
  code?: string;
  fields?: string[];
}

interface DeviceApiResponse {
  success?: boolean;
  message?: string;
  code?: string;
  fields?: string[];
}

/**
 * AirOS usa `null` cuando una métrica no está disponible; el DTO de
 * persistencia expresa esos datos como opcionales. Omitirlos en esta frontera
 * evita que una métrica ausente invalide el guardado completo.
 */
export function toDevicePersistencePayload(device: SavedDevice): DevicePersistencePayload {
  const { cachedStats, lastStatsAt, ...skeleton } = device;
  void cachedStats;
  void lastStatsAt;
  return Object.fromEntries(
    Object.entries(skeleton).filter(([, value]) => value !== null && value !== undefined),
  ) as DevicePersistencePayload;
}

async function expectSuccessfulDeviceResponse(
  response: Response,
  fallbackMessage: string,
): Promise<DeviceApiResponse> {
  let body: DeviceApiResponse | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') body = parsed as DeviceApiResponse;
  } catch { /* respuesta sin JSON */ }

  if (!response.ok || body?.success === false) {
    const error = new Error(body?.message || fallbackMessage) as DevicePersistenceError;
    error.status = response.status;
    error.code = body?.code;
    error.fields = Array.isArray(body?.fields) ? body.fields : undefined;
    throw error;
  }
  return body ?? {};
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
  const pending = backendDevices.filter(d => !d.hasSshPass && allCreds[normalizeCredentialKey(d.id)]);
  for (const d of pending) {
    const cred = allCreds[normalizeCredentialKey(d.id)]!;
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/db/devices/${d.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sshUser: d.sshUser || cred.user,
          sshPass: cred.pass,
          sshPort: d.sshPort || cred.port || 22,
        }),
      });
      await expectSuccessfulDeviceResponse(response, 'No se pudieron actualizar las credenciales SSH');
    } catch { /* best-effort: se reintenta en la próxima carga */ }
  }
}

export const deviceDb = {
  async loadInventory(): Promise<SavedDevice[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/db/devices`);
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || 'No se pudieron cargar los equipos');
      }
      if (data.success && data.devices) {
        // Inventario compartible: estadísticas locales, nunca claves SSH.
        const [allStats, allCreds] = await Promise.all([
          statsCache.getAll(),
          credCache.getAll(),
        ]);
        const enriched = data.devices.map((d: SavedDevice) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { sshPass: _secret, ...safeDevice } = d;
          return {
            ...safeDevice,
            lastStatsAt: allStats[d.id]?.savedAt ?? d.lastStatsAt,
            cachedStats: allStats[d.id]?.stats
              ? { ...(d.cachedStats ?? {}), ...allStats[d.id]!.stats }
              : d.cachedStats,
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
      throw err;
    }
  },

  async load(): Promise<SavedDevice[]> {
    const inventory = await deviceDb.loadInventory();
    return Promise.all(inventory.map(async device => {
      const credential = await credCache.getForDevice(device);
      return credential
        ? {
            ...device,
            sshUser: device.sshUser || credential.user,
            sshPass: credential.pass,
            sshPort: device.sshPort || credential.port,
          }
        : device;
    }));
  },

  async saveSingle(device: SavedDevice): Promise<void> {
    // Un input inválido debe fallar explícitamente, nunca aparentar éxito.
    if (!device?.id) {
      const error = new Error('El dispositivo no tiene un identificador válido') as DevicePersistenceError;
      error.status = 0;
      throw error;
    }

    // Recuperar la credencial efímera si el objeto React ya no la contiene.
    let toSave = device;
    if (device.sshPass === undefined) {
      const cred = await credCache.getForDevice(device);
      if (cred) {
        toSave = {
          ...device,
          sshUser: device.sshUser || cred.user,
          sshPass: cred.pass,
          sshPort: device.sshPort ?? cred.port,
        };
      }
    }

    // El backend confirma primero; sólo entonces se actualizan cachés locales.
    const payload = toDevicePersistencePayload(toSave);
    const response = await apiFetch(`${API_BASE_URL}/api/db/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await expectSuccessfulDeviceResponse(response, 'No se pudo guardar el dispositivo');

    await Promise.all([
      toSave.cachedStats ? statsCache.save(toSave.id, toSave.cachedStats) : Promise.resolve(),
      toSave.sshUser && toSave.sshPass !== undefined
        ? credCache.saveForDevice(toSave, toSave.sshUser, toSave.sshPass, toSave.sshPort)
        : Promise.resolve(),
    ]);
  },

  async removeSingle(id: string): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/api/db/devices/${id}`, { method: 'DELETE' });
    await expectSuccessfulDeviceResponse(response, 'No se pudo eliminar el dispositivo');
    await Promise.all([
      statsCache.remove(id),
      credCache.remove(id),
    ]);
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
