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
