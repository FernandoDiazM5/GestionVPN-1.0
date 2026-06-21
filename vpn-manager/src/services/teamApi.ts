// ============================================================
//  Servicio de equipo / RBAC (Fase 4) → /api/team
// ============================================================
import { get, post, patch, del } from './sessionClient';
import type {
  Member, Invitation, Role, Assignment, MemberWireguard, MyInvitation, AcceptResult,
} from '../types/account';

export const teamApi = {
  listMembers: () => get<{ success: true; members: Member[] }>('/api/team/members'),

  listInvitations: () => get<{ success: true; invitations: Invitation[] }>('/api/team/invitations'),

  invite: (email: string, role: Exclude<Role, 'OWNER'>, tunnelId?: string, name?: string) =>
    post<{ success: true; role: Role; tunnelId: string | null; dev?: boolean }>(
      '/api/team/invite', { email, role, tunnelId, name }
    ),

  accept: (email: string, otp: string, password?: string, publicKey?: string) =>
    post<AcceptResult>('/api/team/accept', { email, otp, password, publicKey }),

  // Bandeja del invitado (usuario ya autenticado) + aceptación in-app
  myInvitations: () => get<{ success: true; invitations: MyInvitation[] }>('/api/team/my-invitations'),

  acceptInApp: (id: string, publicKey?: string) =>
    post<AcceptResult>(`/api/team/invitations/${id}/accept`, { publicKey }),

  removeMember: (userId: string) => del(`/api/team/member/${userId}`),

  /** Suspende o reactiva al miembro (sin borrarlo) y sincroniza el peer WG en MikroTik. */
  setMemberDisabled: (userId: string, disabled: boolean) =>
    patch<{ success: true; message: string; userId: string; disabled: boolean; router: { updated: number; failed: number; skipped: boolean } }>(
      `/api/team/member/${userId}`, { disabled }
    ),

  revokeInvitation: (id: string) => post(`/api/team/invitation/${id}/revoke`),

  // ── Asignación de túneles (Fase C) ──
  listAssignments: () => get<{ success: true; assignments: Assignment[] }>('/api/team/assignments'),

  assignTunnel: (userId: string, tunnelId: string) =>
    post('/api/team/assignments', { userId, tunnelId }),

  removeAssignment: (id: string) => del(`/api/team/assignments/${id}`),

  /** Túneles del workspace (lectura ligera de MySQL, sin RouterOS). Picker del modal. */
  listWorkspaceTunnels: () =>
    get<{ success: true; tunnels: Array<{ ppp_user: string; nombre_vrf: string | null; nombre_nodo: string | null }> }>(
      '/api/team/workspace-tunnels'
    ),

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

  /** (Re)genera el acceso WireGuard del propio usuario en sesión (recuperación). */
  provisionMyWireguard: () =>
    post<{ success: true; wireguard: MemberWireguard; conf: string | null }>('/api/team/me/wireguard'),

  /** Conf completa de un peer por su clave pública (solo moderador). */
  wireguardByKey: (publicKey: string) =>
    get<{ success: true; wireguard: MemberWireguard & { peerName?: string } }>(
      `/api/team/wireguard/by-key/${encodeURIComponent(publicKey)}`
    ),
};
