import { z } from 'zod';
import { EmailSchema, OtpSchema, PasswordSchema, Role } from './common';

// ────────────────────────────────────────────────────────────────────
//  /api/account  (registro multi-tenant + ajustes del usuario logueado)
// ────────────────────────────────────────────────────────────────────

/** POST /api/account/register */
export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().max(120).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/** POST /api/account/verify */
export const VerifyRequestSchema = z.object({
  email: EmailSchema,
  otp: OtpSchema,
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

/** POST /api/account/resend */
export const ResendRequestSchema = z.object({
  email: EmailSchema,
});
export type ResendRequest = z.infer<typeof ResendRequestSchema>;

/** POST /api/account/login (multi-tenant) */
export const AccountLoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export type AccountLoginRequest = z.infer<typeof AccountLoginRequestSchema>;

/** PATCH /api/account/password */
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/** PATCH /api/account/email/request */
export const ChangeEmailRequestSchema = z.object({
  newEmail: EmailSchema,
});
export type ChangeEmailRequest = z.infer<typeof ChangeEmailRequestSchema>;

/** POST /api/account/email/confirm */
export const ChangeEmailConfirmSchema = z.object({
  newEmail: EmailSchema,
  otp: OtpSchema,
  currentPassword: z.string().min(1).max(128),
});
export type ChangeEmailConfirm = z.infer<typeof ChangeEmailConfirmSchema>;

// ────────────────────────────────────────────────────────────────────
//  Respuestas
// ────────────────────────────────────────────────────────────────────

/** GET /api/account/me — usuario de la sesión actual. */
export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role: Role;
  workspace_id: string;
  /** Nombre legible del workspace (para headers de UI). */
  workspace_name?: string;
  /** Administrador de plataforma (Sistemas) — opera la plataforma. */
  platform_admin?: boolean;
}

export interface AccountLoginResponse {
  success: true;
  user: SessionUser;
}
