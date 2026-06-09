// ============================================================
//  Cliente HTTP para el sistema multi-usuario (Fase 4)
//  Usa cookies HttpOnly (credentials: 'include') — independiente
//  del apiClient legacy (Bearer).
//
//  Dispara 'auth_expired' (window event) cuando el backend devuelve
//  401 con códigos USER_DELETED / SESSION_EXPIRED / NO_SESSION para que
//  el contexto VPN limpie la sesión y redirija a login.
// ============================================================
import { API_BASE_URL } from '../config';

export interface ApiError extends Error {
  status: number;
  code?: string;
}

// Endpoints que NO deben disparar logout aunque devuelvan 401 (login,
// status público, etc.). Sin esto, un login fallido lanzaría 'auth_expired'.
const AUTH_PUBLIC_PATHS = [
  '/api/auth/login', '/api/auth/status', '/api/team/accept',
  '/api/auth/password-reset/request', '/api/auth/password-reset/confirm',
];
const SESSION_INVALID_CODES = new Set(['USER_DELETED', 'SESSION_EXPIRED', 'NO_SESSION']);

let dispatchedExpired = false;
function dispatchAuthExpired() {
  // Evitar disparar 'auth_expired' múltiples veces si varias requests fallan a la vez
  if (dispatchedExpired) return;
  dispatchedExpired = true;
  try { window.dispatchEvent(new Event('auth_expired')); } catch { /* SSR */ }
  // Permite re-disparar tras un breve cooldown (por si el user vuelve a loguearse)
  setTimeout(() => { dispatchedExpired = false; }, 3000);
}

/** Realiza una llamada JSON al backend de sesión. Lanza ApiError en fallo. */
export async function apiJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  let body: any = null;
  try { body = await res.json(); } catch { /* sin cuerpo */ }

  if (!res.ok || (body && body.success === false)) {
    const err = new Error(body?.message || `Error ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = body?.code;

    // Sesión inválida → forzar logout global (excepto en endpoints públicos)
    const isPublic = AUTH_PUBLIC_PATHS.some(p => path.startsWith(p));
    if (!isPublic && res.status === 401 && SESSION_INVALID_CODES.has(err.code || '')) {
      dispatchAuthExpired();
    }
    throw err;
  }
  return body as T;
}

export const get = <T = any>(path: string) => apiJson<T>(path);
export const post = <T = any>(path: string, data?: unknown) =>
  apiJson<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined });
export const patch = <T = any>(path: string, data?: unknown) =>
  apiJson<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined });
export const del = <T = any>(path: string) => apiJson<T>(path, { method: 'DELETE' });
