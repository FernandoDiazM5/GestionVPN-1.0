// ============================================================
//  Limpieza de datos locales por usuario/workspace
//  Evita que datos de un moderador (escaneo, CPEs, stats, credenciales)
//  se "filtren" al siguiente que use el mismo navegador.
// ============================================================
import { credCache, statsCache } from '../store/deviceDb';
import { cpeCache } from '../store/cpeCache';

/** Borra escaneo (sessionStorage) + cachés IndexedDB (CPEs/stats/credenciales). */
export async function clearUserScopedData(): Promise<void> {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  await Promise.allSettled([credCache.clear(), statsCache.clear(), cpeCache.clear()]);
}

/**
 * Si el workspace de la sesión activa cambió respecto al último visto en este
 * navegador, purga los datos locales del workspace anterior. Idempotente.
 */
export function purgeIfWorkspaceChanged(workspaceId?: string | null): void {
  try {
    const cur = workspaceId || '';
    if (!cur) return;
    const prev = localStorage.getItem('vpn_active_ws');
    if (prev && prev !== cur) void clearUserScopedData();
    localStorage.setItem('vpn_active_ws', cur);
  } catch { /* ignore */ }
}
