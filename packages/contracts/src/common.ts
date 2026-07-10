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
//  Cuentas locales (username sin correo real)
//  `users.email` es NOT NULL + UNIQUE en BD; una cuenta creada solo con
//  usuario recibe el email SINTÉTICO `<username>@local.app` (mismo patrón
//  que el bridge legacy de sessionBridge.js). Ese dominio jamás recibe
//  correo: notifier/password-reset lo tratan como "sin email".
// ────────────────────────────────────────────────────────────────────

export const LOCAL_DOMAIN = 'local.app';

/** Email sintético de una cuenta local: `pepe` → `pepe@local.app`. */
export const syntheticEmail = (username: string): string =>
  `${String(username).trim().toLowerCase()}@${LOCAL_DOMAIN}`;

/** ¿El email es sintético (cuenta local sin correo real asociado)? */
export const isSyntheticEmail = (email: string | null | undefined): boolean =>
  String(email ?? '').trim().toLowerCase().endsWith(`@${LOCAL_DOMAIN}`);

/** Username de cuenta local: 3-32, minúsculas/dígitos y ._- interiores.
 *  Sin `@` → un username nunca puede confundirse con un email. */
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(32, 'Máximo 32 caracteres')
  .regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/, 'Solo minúsculas, números y . _ - (sin empezar/terminar con símbolo)');

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
