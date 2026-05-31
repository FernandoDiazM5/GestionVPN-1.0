// ============================================================
//  Servicio de auditoría (Fase 4) → /api/audit
// ============================================================
import { get } from './sessionClient';
import type { AuditLog } from '../types/account';

export const auditApi = {
  listLogs: (limit = 100, tunnelId?: string) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (tunnelId) q.set('tunnelId', tunnelId);
    return get<{ success: true; logs: AuditLog[] }>(`/api/audit/logs?${q.toString()}`);
  },
};
