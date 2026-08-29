// ============================================================
//  Cliente HTTP para el sistema multi-usuario (Fase 4)
//  Usa cookies HttpOnly (credentials: 'include') en todas las solicitudes.
//
//  Dispara 'auth_expired' (window event) cuando el backend devuelve
//  401 con códigos USER_DELETED / SESSION_EXPIRED / NO_SESSION para que
//  el contexto VPN limpie la sesión y redirija a login.
// ============================================================
import { API_BASE_URL } from '../config';
import { reportFrontendError } from './errorReporting';
import { addCsrfHeader } from '../utils/csrf';

export interface ApiError extends Error {
  status: number;
  code?: string;
}

// Endpoints que NO deben disparar logout aunque devuelvan 401 (login,
// status público, etc.). Sin esto, un login fallido lanzaría 'auth_expired'.
const AUTH_PUBLIC_PATHS = [
  '/api/auth/login', '/api/auth/status', '/api/team/accept',
  '/api/auth/password-reset/request', '/api/auth/password-reset/confirm',
  '/api/account/login', '/api/account/register', '/api/account/verify', '/api/account/resend',
  '/api/account/federated/csrf', '/api/account/federated/exchange',
];
const SESSION_INVALID_CODES = new Set([
  'USER_DELETED', 'ACCOUNT_SUSPENDED', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'NO_SESSION',
]);

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
interface ApiResponseBody {
  success?: boolean;
  message?: string;
  code?: string;
}

export async function apiJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  addCsrfHeader(headers, init?.method);
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
    });
  } catch (error) {
    reportFrontendError(error, { source: 'async', route: path });
    throw error;
  }

  if (res.status >= 500) {
    reportFrontendError(new Error(`HTTP ${res.status}`), { source: 'async', route: path });
  }

  let body: ApiResponseBody | null = null;
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object') body = parsed as ApiResponseBody;
  } catch { /* sin cuerpo */ }

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

export async function apiForm<T = unknown>(path: string, form: FormData, method = 'PUT'): Promise<T> {
  const headers = new Headers();
  addCsrfHeader(headers, method);
  const res = await fetch(`${API_BASE_URL}${path}`, { method, body: form, credentials: 'include', headers });
  const body = await res.json().catch(() => null) as ApiResponseBody | null;
  if (!res.ok || body?.success === false) {
    const error = new Error(body?.message || `Error ${res.status}`) as ApiError;
    error.status = res.status; error.code = body?.code;
    throw error;
  }
  return body as T;
}

export const get = <T = unknown>(path: string) => apiJson<T>(path);
export const post = <T = unknown>(path: string, data?: unknown) =>
  apiJson<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined });
export const patch = <T = unknown>(path: string, data?: unknown) =>
  apiJson<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined });
export const put = <T = unknown>(path: string, data?: unknown) =>
  apiJson<T>(path, { method: 'PUT', body: data ? JSON.stringify(data) : undefined });
export const del = <T = unknown>(path: string) => apiJson<T>(path, { method: 'DELETE' });
