// ============================================================
//  Cliente HTTP para el sistema multi-usuario (Fase 4)
//  Usa cookies HttpOnly (credentials: 'include') — independiente
//  del apiClient legacy (Bearer). No dispara 'auth_expired'.
// ============================================================
import { API_BASE_URL } from '../config';

export interface ApiError extends Error {
  status: number;
  code?: string;
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
