import { z } from 'zod';
import { EmailSchema, OtpSchema, PasswordSchema, PublicKeySchema, Role } from './common';

// ────────────────────────────────────────────────────────────────────
//  /api/team  (invitaciones, miembros, asignaciones, WireGuard)
// ────────────────────────────────────────────────────────────────────

/** POST /api/team/invite */
export const InviteRequestSchema = z.object({
  email: EmailSchema,
  name: z.string().max(120).optional(),
  role: z.enum(['MEMBER', 'CO_MODERATOR']).default('MEMBER'),
  tunnelId: z.string().max(160).optional(),
});
export type InviteRequest = z.infer<typeof InviteRequestSchema>;

/** POST /api/team/accept (público) */
export const AcceptRequestSchema = z.object({
  email: EmailSchema,
  otp: OtpSchema,
  password: PasswordSchema.optional(),
  publicKey: PublicKeySchema.optional(),
});
export type AcceptRequest = z.infer<typeof AcceptRequestSchema>;

/** POST /api/team/invitations/:id/accept (in-app) */
export const InAppAcceptRequestSchema = z.object({
  publicKey: PublicKeySchema.optional(),
});
export type InAppAcceptRequest = z.infer<typeof InAppAcceptRequestSchema>;

/** POST /api/team/role */
export const ChangeRoleRequestSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['MEMBER', 'CO_MODERATOR']),
});
export type ChangeRoleRequest = z.infer<typeof ChangeRoleRequestSchema>;

/** PATCH /api/team/member/:userId */
export const MemberPatchRequestSchema = z
  .object({ disabled: z.boolean() })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nada que actualizar' });
export type MemberPatchRequest = z.infer<typeof MemberPatchRequestSchema>;

/** POST /api/team/member/:id/wireguard */
export const MemberWireguardProvisionSchema = z.object({
  mode: z.enum(['generate', 'publicKey']).default('generate'),
  publicKey: PublicKeySchema.optional(),
});
export type MemberWireguardProvisionRequest = z.infer<
  typeof MemberWireguardProvisionSchema
>;

/** POST /api/team/assignments */
export const AssignmentCreateSchema = z.object({
  userId: z.string().min(1),
  tunnelId: z.string().min(1).max(160),
});
export type AssignmentCreateRequest = z.infer<typeof AssignmentCreateSchema>;

// ────────────────────────────────────────────────────────────────────
//  Respuestas
// ────────────────────────────────────────────────────────────────────

/** Miembro del workspace (GET /api/team/members). */
export interface Member {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  joined_at: number;
  /** Suspendido por el moderador. */
  disabled?: boolean;
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

/** Datos del servidor WG devueltos al aceptar. */
export interface WgServerConfig {
  allowedIp: string;
  serverPublicKey: string;
  endpoint: string;
  allowedIps: string;
}

/** POST /api/team/accept (o in-app). */
export interface AcceptResponse {
  success: true;
  user: { id: string; email: string; role: Role; workspace_id: string };
  tunnel: string | null;
  wireguard: WgServerConfig | null;
  /** Contenido completo del .conf con PrivateKey real (sólo si el server generó las claves). */
  conf?: string | null;
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

/** Etiqueta legible por rol — la mantenemos aquí para que ambos lados la importen. */
export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Propietario',
  CO_MODERATOR: 'Co-moderador',
  MEMBER: 'Miembro',
};
