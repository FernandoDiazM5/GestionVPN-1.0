// ============================================================
//  Servicio de cuenta (Fase 4) → /api/account
// ============================================================
import { get, post } from './sessionClient';
import { API_BASE_URL } from '../config';
import { getApiToken } from '../utils/apiClient';
import type { SessionUser } from '../types/account';

export const accountApi = {
  me: () => get<{ success: true; user: SessionUser }>('/api/account/me'),

  /** Puente desde la sesión legacy (Bearer) → emite cookie multi-usuario. */
  bridge: async (): Promise<{ success: true; user: SessionUser }> => {
    const res = await fetch(`${API_BASE_URL}/api/account/bridge`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getApiToken()}` },
    });
    const body = await res.json();
    if (!res.ok || body?.success === false) throw new Error(body?.message || 'bridge failed');
    return body;
  },

  register: (email: string, password: string, name?: string) =>
    post<{ success: true; dev?: boolean }>('/api/account/register', { email, password, name }),

  verify: (email: string, otp: string) =>
    post<{ success: true; user: SessionUser }>('/api/account/verify', { email, otp }),

  resend: (email: string) => post('/api/account/resend', { email }),

  login: (email: string, password: string) =>
    post<{ success: true; user: SessionUser }>('/api/account/login', { email, password }),

  logout: () => post('/api/account/logout'),
};
