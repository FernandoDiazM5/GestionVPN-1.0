// ============================================================
//  Servicio de cuenta (Fase 4) → /api/account
// ============================================================
import { get, post } from './sessionClient';
import type { SessionUser } from '../types/account';

export const accountApi = {
  me: () => get<{ success: true; user: SessionUser }>('/api/account/me'),

  register: (email: string, password: string, name?: string) =>
    post<{ success: true; dev?: boolean }>('/api/account/register', { email, password, name }),

  verify: (email: string, otp: string) =>
    post<{ success: true; user: SessionUser }>('/api/account/verify', { email, otp }),

  resend: (email: string) => post('/api/account/resend', { email }),

  login: (email: string, password: string) =>
    post<{ success: true; user: SessionUser }>('/api/account/login', { email, password }),

  logout: () => post('/api/account/logout'),
};
