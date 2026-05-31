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

/** Etiqueta legible por rol. */
export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Propietario',
  CO_MODERATOR: 'Co-moderador',
  MEMBER: 'Miembro',
};
