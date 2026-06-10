import { z } from 'zod';
import { EmailSchema, PasswordSchema } from './common';

// ────────────────────────────────────────────────────────────────────
//  /api/auth  (legacy + recuperación de contraseña)
// ────────────────────────────────────────────────────────────────────

/** POST /api/auth/login */
export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Respuesta de login (legacy o multi-tenant). */
export interface LoginResponse {
  success: true;
  message: string;
  token: string;
  user: string;
  role: 'admin' | 'viewer';
}

/** POST /api/auth/setup (sólo si no hay usuarios) */
export const SetupRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

/** POST /api/auth/password-reset/request */
export const PasswordResetRequestSchema = z.object({
  email: EmailSchema,
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/** POST /api/auth/password-reset/confirm */
export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(16).max(255),
  newPassword: PasswordSchema,
});
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
