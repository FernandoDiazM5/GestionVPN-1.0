import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────
//  Tipos compartidos básicos
// ────────────────────────────────────────────────────────────────────

// Roles RBAC del workspace: un único moderador (OWNER) + sus miembros (MEMBER).
// El rol CO_MODERATOR fue retirado (cada workspace tiene un solo moderador).
export const RoleSchema = z.enum(['OWNER', 'MEMBER']);
export type Role = z.infer<typeof RoleSchema>;

export const EmailSchema = z.string().email('Email inválido').max(255);
export const PasswordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128);
export const OtpSchema = z.string().regex(/^\d{6}$/, 'OTP de 6 dígitos');
export const PublicKeySchema = z.string().max(120);

// ────────────────────────────────────────────────────────────────────
//  Sobres estándar de respuesta API
//  Todos los endpoints devuelven una de estas dos formas.
// ────────────────────────────────────────────────────────────────────

/** Sobre de éxito — los datos adicionales se aplanan junto a `success: true`. */
export interface ApiSuccess<T extends Record<string, unknown> = Record<string, unknown>> {
  success: true;
  message?: string;
  // Cada endpoint añade sus campos específicos en T
  data?: T;
}

/** Sobre de error — message legible + code máquina opcional. */
export interface ApiError {
  success: false;
  message: string;
  code?: string;
  errors?: unknown;
}

export type ApiResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | (ApiSuccess<T> & T)
  | ApiError;
