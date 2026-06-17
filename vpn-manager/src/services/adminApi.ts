// ============================================================
//  Servicio del Administrador de plataforma (Roles v2) → /api/admin
// ============================================================
import { get, post, patch, del } from './sessionClient';
import type { AdminSummary, Moderator, AuditLog } from '../types/account';

export interface PendingInvitation {
  id: string;
  email: string;
  name: string | null;
  workspace_name: string | null;
  expires_at: number;
  created_at: number;
}

export const adminApi = {
  summary: () => get<{ success: true; summary: AdminSummary; recent: AuditLog[] }>('/api/admin/summary'),

  listModerators: () => get<{ success: true; moderators: Moderator[] }>('/api/admin/moderators'),

  createModerator: (data: { email: string; password: string; name?: string; workspaceName?: string }) =>
    post<{ success: true; moderator: { user_id: string; email: string; workspace_id: string } }>(
      '/api/admin/moderators', data
    ),

  /** Invita a un nuevo moderador por email (mismo UX que invitar miembro): el
   *  invitado recibe correo con link, define su contraseña y genera su WG.
   *  Devuelve además `acceptUrl` para compartirlo a mano si el correo no llega. */
  inviteModerator: (data: { email: string; name?: string; workspaceName?: string }) =>
    post<{
      success: true; message: string; email: string; workspace_id: string;
      workspace_name: string; acceptUrl: string; code: string;
      emailSent: boolean; emailError?: string;
    }>('/api/admin/invite-moderator', data),

  /** Lista las invitaciones de moderador PENDIENTES por aceptar. */
  listInvitations: () =>
    get<{ success: true; invitations: PendingInvitation[] }>('/api/admin/invitations'),

  /** Regenera el OTP de una invitación pendiente y devuelve un enlace fresco. */
  invitationLink: (id: string) =>
    post<{ success: true; email: string; acceptUrl: string; code: string }>(
      `/api/admin/invitations/${id}/link`, {}
    ),

  updateModerator: (
    id: string,
    data: { name?: string; workspaceName?: string; password?: string; disabled?: boolean }
  ) => patch<{ success: true; message: string }>(`/api/admin/moderators/${id}`, data),

  deleteModerator: (id: string) =>
    del<{ success: true; message: string }>(`/api/admin/moderators/${id}`),
};
