import { z } from 'zod';
import { EmailSchema, PasswordSchema } from './common';

// ────────────────────────────────────────────────────────────────────
//  /api/admin  (sólo platform_admin)
// ────────────────────────────────────────────────────────────────────

/** POST /api/admin/moderators (creación directa, sin invitación) */
export const CreateModeratorRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().max(120).optional(),
  workspaceName: z.string().max(160).optional(),
});
export type CreateModeratorRequest = z.infer<typeof CreateModeratorRequestSchema>;

/** PATCH /api/admin/moderators/:id */
export const ModeratorPatchRequestSchema = z
  .object({
    name: z.string().max(120).optional(),
    workspaceName: z.string().min(1).max(160).optional(),
    password: PasswordSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nada que actualizar' });
export type ModeratorPatchRequest = z.infer<typeof ModeratorPatchRequestSchema>;

/** POST /api/admin/invite-moderator (flujo unificado con invitación) */
export const InviteModeratorRequestSchema = z.object({
  email: EmailSchema,
  name: z.string().max(120).optional(),
  workspaceName: z.string().max(160).optional(),
});
export type InviteModeratorRequest = z.infer<typeof InviteModeratorRequestSchema>;

// ────────────────────────────────────────────────────────────────────
//  Respuestas
// ────────────────────────────────────────────────────────────────────

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
