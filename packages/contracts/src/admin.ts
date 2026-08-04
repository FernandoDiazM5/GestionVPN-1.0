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
    password: PasswordSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .strict()
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
  ai_access?: import('./airOsAi').ModeratorAiAccess;
}

/** Métricas del dashboard del Administrador. */
export interface AdminSummary {
  workspaces: number;
  usuarios: number;
  moderadores: number;
  miembros: number;
  acciones_24h: number;
}
export const SecurityReasonCategorySchema = z.enum([
  'FALSE_POSITIVE', 'ADMIN_ACCESS', 'MAINTENANCE', 'SECURITY_TEST', 'OTHER',
]);
export const SecurityDurationSchema = z.enum(['15m', '1h', '6h', '24h', '7d', 'indefinite']);
const SecurityTargetSchema = z.string().trim().min(3).max(64).refine((value) => {
  const bare = value.split('/')[0];
  const family = z.ipv4().safeParse(bare).success ? 4 : z.ipv6().safeParse(bare).success ? 6 : 0;
  if (!family) return false;
  if (!value.includes('/')) return true;
  const prefix = Number(value.split('/')[1]);
  return Number.isInteger(prefix) && (family === 4 ? prefix >= 24 && prefix <= 32 : prefix >= 64 && prefix <= 128);
}, 'IP/CIDR inválido o demasiado amplio');
const SecurityReasonSchema = z.string().trim().min(10).max(500);

export const SecurityStepUpRequestSchema = z.object({
  password: z.string().max(1024).optional(),
  firebaseIdToken: z.string().max(8192).optional(),
}).strict().refine((value) => Boolean(value.password) !== Boolean(value.firebaseIdToken),
  'Envía contraseña o confirmación de Google');

export const SecurityMutationSchema = z.object({
  target: SecurityTargetSchema,
  jail: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  duration: SecurityDurationSchema.optional(),
  category: SecurityReasonCategorySchema,
  reason: SecurityReasonSchema,
  stepUpToken: z.string().trim().min(32).max(256),
  confirmIndefinite: z.boolean().optional(),
  confirmNetworkTrust: z.boolean().optional(),
}).strict();

export const SecurityHistoryQuerySchema = z.object({
  target: SecurityTargetSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
}).strict();

export const AccountUnlockMutationSchema = z.object({
  userId: z.string().uuid(),
  category: SecurityReasonCategorySchema,
  reason: SecurityReasonSchema,
  stepUpToken: z.string().trim().min(32).max(256),
}).strict();
export type AccountUnlockMutation = z.infer<typeof AccountUnlockMutationSchema>;
