// ============================================================
//  Servicio del Administrador de plataforma (Roles v2) → /api/admin
// ============================================================
import { get, post, patch, del } from './sessionClient';
import type { AdminSummary, Moderator, AuditLog } from '../types/account';

export const adminApi = {
  summary: () => get<{ success: true; summary: AdminSummary; recent: AuditLog[] }>('/api/admin/summary'),

  listModerators: () => get<{ success: true; moderators: Moderator[] }>('/api/admin/moderators'),

  createModerator: (data: { email: string; password: string; name?: string; workspaceName?: string }) =>
    post<{ success: true; moderator: { user_id: string; email: string; workspace_id: string } }>(
      '/api/admin/moderators', data
    ),

  /** Invita a un nuevo moderador por email (mismo UX que invitar miembro): el
   *  invitado recibe correo con link, define su contraseña y genera su WG. */
  inviteModerator: (data: { email: string; name?: string; workspaceName?: string }) =>
    post<{ success: true; message: string; email: string; workspace_id: string; workspace_name: string; dev?: boolean }>(
      '/api/admin/invite-moderator', data
    ),

  updateModerator: (
    id: string,
    data: { name?: string; workspaceName?: string; password?: string; disabled?: boolean }
  ) => patch<{ success: true; message: string }>(`/api/admin/moderators/${id}`, data),

  deleteModerator: (id: string) =>
    del<{ success: true; message: string }>(`/api/admin/moderators/${id}`),
};
