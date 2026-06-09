// ============================================================
//  Recuperación de contraseña (Fase D) — endpoints públicos
// ============================================================
import { post } from './sessionClient';

export const passwordResetApi = {
  /** Solicita un email con el link de recuperación. Siempre devuelve 200 con
   *  el mismo mensaje (anti-enumeración de cuentas). */
  request: (email: string) =>
    post<{ success: true; message: string }>('/api/auth/password-reset/request', { email }),

  /** Confirma el cambio con el token recibido por email + nueva contraseña. */
  confirm: (token: string, newPassword: string) =>
    post<{ success: true; message: string }>('/api/auth/password-reset/confirm', { token, newPassword }),
};
