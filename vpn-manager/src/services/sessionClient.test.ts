// ============================================================
//  sessionClient.test.ts — comportamiento del cliente HTTP
//
//  Crítico:
//   • Dispara window 'auth_expired' SOLO en 401 con USER_DELETED /
//     SESSION_EXPIRED / NO_SESSION → habilita el deslogueo automático.
//   • NO dispara en endpoints públicos (login, status, accept, reset)
//     porque ahí un 401 es válido (credencial mala) y no debe sacar
//     al usuario de cualquier sesión activa.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/setup';
import { apiJson } from './sessionClient';
import { API_BASE_URL } from '../config';

describe('sessionClient.apiJson', () => {
  let authExpiredSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    authExpiredSpy = vi.fn();
    window.addEventListener('auth_expired', authExpiredSpy);
    // El cliente tiene un cooldown de 3s entre disparos de auth_expired
    // (anti-spam). Usamos fake timers para resetear el cooldown entre
    // tests sin esperar real-time.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    window.removeEventListener('auth_expired', authExpiredSpy);
    // Avanza el cooldown completo y restaura timers reales
    vi.advanceTimersByTime(3500);
    vi.useRealTimers();
  });

  it('200 OK: devuelve el body parseado', async () => {
    server.use(http.get(`${API_BASE_URL}/api/test/ok`, () =>
      HttpResponse.json({ success: true, foo: 'bar' })));
    const r = await apiJson<{ success: true; foo: string }>('/api/test/ok');
    expect(r).toEqual({ success: true, foo: 'bar' });
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });

  it('4xx con success: false → throw ApiError sin disparar auth_expired', async () => {
    server.use(http.get(`${API_BASE_URL}/api/test/err`, () =>
      HttpResponse.json({ success: false, code: 'BAD_INPUT', message: 'nope' }, { status: 422 })));
    await expect(apiJson('/api/test/err')).rejects.toMatchObject({
      status: 422, code: 'BAD_INPUT', message: 'nope',
    });
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });

  it('401 USER_DELETED → dispara auth_expired y throw', async () => {
    server.use(http.get(`${API_BASE_URL}/api/test/me`, () =>
      HttpResponse.json({ success: false, code: 'USER_DELETED', message: 'eliminado' }, { status: 401 })));
    await expect(apiJson('/api/test/me')).rejects.toMatchObject({ status: 401, code: 'USER_DELETED' });
    expect(authExpiredSpy).toHaveBeenCalledTimes(1);
  });

  it('401 SESSION_EXPIRED → dispara auth_expired', async () => {
    server.use(http.get(`${API_BASE_URL}/api/test/x`, () =>
      HttpResponse.json({ success: false, code: 'SESSION_EXPIRED' }, { status: 401 })));
    await expect(apiJson('/api/test/x')).rejects.toThrow();
    expect(authExpiredSpy).toHaveBeenCalledTimes(1);
  });

  it('401 NO_SESSION → dispara auth_expired', async () => {
    server.use(http.get(`${API_BASE_URL}/api/test/y`, () =>
      HttpResponse.json({ success: false, code: 'NO_SESSION' }, { status: 401 })));
    await expect(apiJson('/api/test/y')).rejects.toThrow();
    expect(authExpiredSpy).toHaveBeenCalledTimes(1);
  });

  it('401 BAD_CREDENTIALS (otro code) → NO dispara auth_expired', async () => {
    // BAD_CREDENTIALS no está en la lista de códigos de sesión inválida —
    // es un login fallido, no debería sacar al usuario.
    server.use(http.post(`${API_BASE_URL}/api/test/login`, () =>
      HttpResponse.json({ success: false, code: 'BAD_CREDENTIALS' }, { status: 401 })));
    await expect(apiJson('/api/test/login', { method: 'POST' })).rejects.toThrow();
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });

  it('endpoint público (/api/auth/login) con 401 USER_DELETED: NO dispara auth_expired', async () => {
    // Pasthroughs públicos: aunque devuelvan códigos sesión inválida (caso
    // raro / mal config), el cliente NO debe interpretar como deslogueo.
    server.use(http.post(`${API_BASE_URL}/api/auth/login`, () =>
      HttpResponse.json({ success: false, code: 'USER_DELETED' }, { status: 401 })));
    await expect(apiJson('/api/auth/login', { method: 'POST' })).rejects.toThrow();
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });

  it('endpoint público (/api/team/accept) con 401: NO dispara auth_expired', async () => {
    server.use(http.post(`${API_BASE_URL}/api/team/accept`, () =>
      HttpResponse.json({ success: false, code: 'SESSION_EXPIRED' }, { status: 401 })));
    await expect(apiJson('/api/team/accept', { method: 'POST' })).rejects.toThrow();
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });

  it('endpoint público (/api/auth/password-reset/request) con 401: NO dispara auth_expired', async () => {
    server.use(http.post(`${API_BASE_URL}/api/auth/password-reset/request`, () =>
      HttpResponse.json({ success: false, code: 'NO_SESSION' }, { status: 401 })));
    await expect(apiJson('/api/auth/password-reset/request', { method: 'POST' })).rejects.toThrow();
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });
});
