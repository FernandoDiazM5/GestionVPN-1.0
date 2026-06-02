// ============================================================
//  Tipos del sistema multi-usuario (Fase 4) — espejo del backend
//  Endpoints: /api/account, /api/team, /api/audit
// ============================================================

export type Role = 'OWNER' | 'CO_MODERATOR' | 'MEMBER';

/** Usuario de la sesión actual (GET /api/account/me). */
export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role: Role;
  workspace_id: string;
  /** Administrador de plataforma (Sistemas) — opera la plataforma. */
  platform_admin?: boolean;
}

/** Moderador (OWNER de un workspace) visto por el Administrador. */
export interface Moderator {
  user_id: string;
  email: string;
  name: string;
  created_at: number;
  workspace_id: string;
  workspace_name: string;
  miembros: number;
  disabled?: boolean;
}

/** Métricas del dashboard del Administrador. */
export interface AdminSummary {
  workspaces: number;
  usuarios: number;
  moderadores: number;
  comoderadores: number;
  miembros: number;
  acciones_24h: number;
}

/** Miembro del workspace (GET /api/team/members). */
export interface Member {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  joined_at: number;
}

/** Invitación pendiente (GET /api/team/invitations). */
export interface Invitation {
  id: string;
  email: string;
  role: Exclude<Role, 'OWNER'>;
  attempts: number;
  expires_at: number;
  created_at: number;
  tunnel_id?: string | null;
}

/** Invitación PENDING vista por el invitado (bandeja in-app). */
export interface MyInvitation {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: Exclude<Role, 'OWNER'>;
  tunnel_id: string | null;
  expires_at: number;
  created_at: number;
}

/** Datos del servidor WG devueltos al aceptar (para completar el .conf en el dispositivo). */
export interface WgServerConfig {
  allowedIp: string;
  serverPublicKey: string;
  endpoint: string;
  allowedIps: string;
}

/** Respuesta de aceptar una invitación (pública o in-app). */
export interface AcceptResult {
  success: true;
  user: { id: string; email: string; role: Role; workspace_id: string };
  tunnel: string | null;
  wireguard: WgServerConfig | null;
}

/** Entrada de auditoría (GET /api/audit/logs). */
export interface AuditLog {
  id: string;
  tunnel_id: string;
  action: string;
  ip_address: string | null;
  detail: string | null;
  created_at: number;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
}

/** Asignación de túnel a un miembro. */
export interface Assignment {
  id: string;
  tunnel_id: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  created_at: number;
}

/** Acceso WireGuard de un miembro. */
export interface MemberWireguard {
  allowedIp: string;
  publicKey: string;
  serverPublicKey?: string | null;
  endpoint?: string | null;
  allowedIps?: string;
  conf: string | null;
}

/** Etiqueta legible por rol. */
export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Propietario',
  CO_MODERATOR: 'Co-moderador',
  MEMBER: 'Miembro',
};
