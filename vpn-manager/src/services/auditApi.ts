// ============================================================
//  Servicio de auditoría (Fase 4) → /api/audit
// ============================================================
import { get } from './sessionClient';
import type { AuditLog } from '../types/account';
import type { AuditExportRequest } from '@gestionvpn/contracts';
import { API_BASE_URL } from '../config';

export const auditApi = {
  listLogs: (limit = 100, tunnelId?: string) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (tunnelId) q.set('tunnelId', tunnelId);
    return get<{ success: true; logs: AuditLog[] }>(`/api/audit/logs?${q.toString()}`);
  },

  /**
   * Export (Q4) — devuelve { blob, filename } para que el caller dispare la
   * descarga via downloadBlob(). Lanza Error con el mensaje del server si 4xx/5xx.
   * Usa fetch directo (no sessionClient.post) porque el cuerpo es binario y
   * necesitamos leer Content-Disposition.
   */
  exportLogs: async (req: AuditExportRequest): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${API_BASE_URL}/api/audit/export`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/i);
    const filename = m ? m[1] : `audit.${req.format || 'csv'}`;
    return { blob, filename };
  },
};

/** Helper UI — recibe { blob, filename } y dispara la descarga del navegador. */
export function downloadBlob({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
