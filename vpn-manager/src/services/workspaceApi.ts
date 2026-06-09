// ============================================================
//  Servicio de workspace — renombrar + import/export (Fase C)
// ============================================================
import { post, patch } from './sessionClient';
import { API_BASE_URL } from '../config';

export interface ImportPlan {
  members:   { create: string[]; update: string[]; skip: string[] };
  tunnels:   { create: string[]; update: string[]; skip: string[] };
  ap_groups: { create: string[]; update: string[]; skip: string[] };
}

export const workspaceApi = {
  /** Renombrar el workspace (solo OWNER). */
  rename: (name: string) =>
    patch<{ success: true; message: string; name: string }>(
      '/api/workspace/name', { name }
    ),

  /** Descarga el JSON del workspace. Devuelve un Blob para disparar el download. */
  export: async (): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${API_BASE_URL}/api/workspace/export`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || `Error ${res.status}`);
    }
    const disp = res.headers.get('Content-Disposition') || '';
    const match = disp.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `workspace-${Date.now()}.json`;
    return { blob: await res.blob(), filename };
  },

  /** Dry-run: devuelve el plan de cambios sin aplicar. */
  importDryRun: (payload: unknown, conflict: 'skip' | 'overwrite' = 'skip') =>
    post<{ success: true; message: string; version: string; conflict: string; plan: ImportPlan }>(
      '/api/workspace/import', { payload, conflict, dryRun: true }
    ),

  /** Aplica la importación tras el dry-run. */
  importApply: (payload: unknown, conflict: 'skip' | 'overwrite' = 'skip') =>
    post<{ success: true; message: string; version: string; conflict: string;
           inserts: Record<string, number>; updates: Record<string, number> }>(
      '/api/workspace/import', { payload, conflict, dryRun: false }
    ),
};
