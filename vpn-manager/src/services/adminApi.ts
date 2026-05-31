// ============================================================
//  Servicio del Administrador de plataforma (Roles v2) → /api/admin
// ============================================================
import { get, post } from './sessionClient';
import type { AdminSummary, Moderator, AuditLog } from '../types/account';

export const adminApi = {
  summary: () => get<{ success: true; summary: AdminSummary; recent: AuditLog[] }>('/api/admin/summary'),

  listModerators: () => get<{ success: true; moderators: Moderator[] }>('/api/admin/moderators'),

  createModerator: (data: { email: string; password: string; name?: string; workspaceName?: string }) =>
    post<{ success: true; moderator: { user_id: string; email: string; workspace_id: string } }>(
      '/api/admin/moderators', data
    ),
};
