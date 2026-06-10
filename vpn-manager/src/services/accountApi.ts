// ============================================================
//  Servicio de cuenta (Fase 4) → /api/account
// ============================================================
import { get, post, patch } from './sessionClient';
import type { SessionUser } from '../types/account';
import type {
  NotificationPreferences,
  NotificationStatus,
  TelegramLinkStartResponse,
} from '@gestionvpn/contracts';

export const accountApi = {
  me: () => get<{ success: true; user: SessionUser }>('/api/account/me'),

  /** Re-emite la cookie de sesión multi-usuario tomando como base la sesión actual. */
  bridge: () => post<{ success: true; user: SessionUser }>('/api/account/bridge'),

  register: (email: string, password: string, name?: string) =>
    post<{ success: true; dev?: boolean }>('/api/account/register', { email, password, name }),

  verify: (email: string, otp: string) =>
    post<{ success: true; user: SessionUser }>('/api/account/verify', { email, otp }),

  resend: (email: string) => post('/api/account/resend', { email }),

  login: (email: string, password: string) =>
    post<{ success: true; user: SessionUser }>('/api/account/login', { email, password }),

  logout: () => post('/api/account/logout'),

  // ── Ajustes del usuario logueado (Fase C) ───────────────────
  /** Cambiar contraseña: requiere la actual. */
  changePassword: (currentPassword: string, newPassword: string) =>
    patch<{ success: true; message: string }>(
      '/api/account/password', { currentPassword, newPassword }
    ),

  /** Solicita el cambio de email: envía OTP al nuevo correo. */
  requestEmailChange: (newEmail: string) =>
    patch<{ success: true; message: string; dev?: boolean }>(
      '/api/account/email/request', { newEmail }
    ),

  /** Confirma el cambio: OTP + currentPassword. */
  confirmEmailChange: (newEmail: string, otp: string, currentPassword: string) =>
    post<{ success: true; message: string; email: string }>(
      '/api/account/email/confirm', { newEmail, otp, currentPassword }
    ),

  // ── Notificaciones (Q1) ─────────────────────────────────────
  getNotifications: () =>
    get<{ success: true } & NotificationStatus>('/api/account/notifications'),

  updateNotifications: (prefs: NotificationPreferences) =>
    patch<{ success: true; message: string }>('/api/account/notifications', prefs),

  startTelegramLink: () =>
    post<TelegramLinkStartResponse>('/api/account/telegram/link/start'),

  unlinkTelegram: () =>
    post<{ success: true; message: string }>('/api/account/telegram/unlink'),
};
