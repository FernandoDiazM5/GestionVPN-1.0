// ============================================================
//  Servicio de equipo / RBAC (Fase 4) → /api/team
// ============================================================
import { get, post, del } from './sessionClient';
import type { Member, Invitation, Role, Assignment, MemberWireguard } from '../types/account';

export const teamApi = {
  listMembers: () => get<{ success: true; members: Member[] }>('/api/team/members'),

  listInvitations: () => get<{ success: true; invitations: Invitation[] }>('/api/team/invitations'),

  invite: (email: string, role: Exclude<Role, 'OWNER'>) =>
    post<{ success: true; role: Role; dev?: boolean }>('/api/team/invite', { email, role }),

  accept: (email: string, otp: string, password?: string, name?: string) =>
    post<{ success: true; user: { id: string; email: string; role: Role; workspace_id: string } }>(
      '/api/team/accept', { email, otp, password, name }
    ),

  changeRole: (userId: string, role: Exclude<Role, 'OWNER'>) =>
    post('/api/team/role', { userId, role }),

  removeMember: (userId: string) => del(`/api/team/member/${userId}`),

  revokeInvitation: (id: string) => post(`/api/team/invitation/${id}/revoke`),

  // ── Asignación de túneles (Fase C) ──
  listAssignments: () => get<{ success: true; assignments: Assignment[] }>('/api/team/assignments'),

  assignTunnel: (userId: string, tunnelId: string) =>
    post('/api/team/assignments', { userId, tunnelId }),

  removeAssignment: (id: string) => del(`/api/team/assignments/${id}`),

  // ── WireGuard del miembro (Fase E) ──
  provisionWireguard: (userId: string) =>
    post<{ success: true; allowedIp: string; publicKey: string; conf: string | null }>(
      `/api/team/member/${userId}/wireguard`, { mode: 'generate' }
    ),

  getMemberWireguard: (userId: string) =>
    get<{ success: true; wireguard: MemberWireguard }>(`/api/team/member/${userId}/wireguard`),

  /** Acceso WireGuard del propio usuario en sesión. */
  myWireguard: () =>
    get<{ success: true; wireguard: MemberWireguard }>('/api/team/member/me/wireguard'),
};
