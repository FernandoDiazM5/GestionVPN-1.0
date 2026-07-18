// ============================================================
//  apiClient.ts — capa fetch base para todo el código legacy.
//
//  Es la capa MÁS BAJA: sólo añade cookies + intercepta eventos
//  globales (auth_expired, mikrotik_needs_config). NO tiene tipos
//  ni helpers HTTP — para código nuevo usar `services/sessionClient.ts`
//  (get/post/patch/del con tipos compartidos desde @gestionvpn/contracts).
//
//  Histórico:
//    • F5 (legacy): eliminó la inyección de `Authorization: Bearer`
//      cuando se migró a cookie HttpOnly `vpn_session`.
//    • F5.C (este refactor): eliminó setApiToken/getApiToken no-op
//      y modernizó el detector de `needsConfig` para preferir el
//      código máquina `NEEDS_CONFIG` sobre el campo legacy.
// ============================================================

import type { TunnelErrorCode } from '@gestionvpn/contracts';
import { reportFrontendError } from '../services/errorReporting';
import { addCsrfHeader } from './csrf';

/**
 * Wrapper tipado de fetch que:
 *  - añade `credentials: 'include'` para enviar la cookie HttpOnly de sesión,
 *  - dispara 'auth_expired' en 401/403 fuera de /api/auth/,
 *  - emite 'mikrotik_needs_config' cuando el backend devuelve 503 con
 *    `code: 'NEEDS_CONFIG'` (preferido) o `needsConfig: true` (legacy).
 */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);

  // Prevenir que fetch sobreescriba headers preexistentes (como Content-Type JSON)
  // a menos que vengamos de FormData que requiere que el browser ponga el boundary
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    if (typeof init?.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
  }
  addCsrfHeader(headers, init?.method);

  let response: Response;
  try {
    response = await fetch(input, {
    ...init,
    credentials: 'include',   // envía cookie HttpOnly de sesión RBAC
    headers,
    });
  } catch (error) {
    reportFrontendError(error, { source: 'async', route: typeof input === 'string' ? input : input.toString() });
    throw error;
  }
  // Interceptar sesión inválida/expirada.
  //  • 401 = sesión muerta SIEMPRE (token ausente/ilegible) → desloguear.
  //  • 403 = AMBIGUO: puede ser "token expirado" (auth.middleware marca
  //    `logout: true`) o "permiso denegado" (ej. requireOperator a un MEMBER).
  //    SOLO el primero debe desloguear. Tratar TODO 403 como expiración
  //    deslogueaba al usuario EN CADENA cuando un MEMBER tocaba un endpoint de
  //    operador — p.ej. POST /node/history/add al activar su túnel asignado
  //    devuelve 403 de permisos, no de sesión.
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
  if (response.status >= 500) {
    reportFrontendError(new Error(`HTTP ${response.status}`), { source: 'async', route: url });
  }
  const isAuthRoute = url.includes('/api/auth/');
  if (!isAuthRoute && response.status === 401) {
    window.dispatchEvent(new Event('auth_expired'));
  } else if (!isAuthRoute && response.status === 403) {
    // Desloguear solo si el backend marca la sesión como caduca (`logout: true`).
    const clone = response.clone();
    try {
      const data: { logout?: boolean } = await clone.json();
      if (data?.logout === true) window.dispatchEvent(new Event('auth_expired'));
    } catch { /* body no-JSON → 403 de permisos, no de sesión: no desloguear */ }
  }

  // Interceptar 503 Service Unavailable — MikroTik no configurado.
  // F5.C: aceptar tanto `code: 'NEEDS_CONFIG'` (forma nueva post-harmonización)
  // como `needsConfig: true` (forma legacy mantenida por backwards-compat).
  if (response.status === 503) {
    const clone = response.clone();
    try {
      const data: { code?: TunnelErrorCode | string; needsConfig?: boolean; unreachable?: boolean; message?: string } = await clone.json();
      if (data.code === 'NEEDS_CONFIG' || data.needsConfig === true) {
        window.dispatchEvent(new CustomEvent('mikrotik_needs_config', { detail: data.message }));
      }
      // Router configurado pero inalcanzable (timeout/refused) → pantalla
      // "router de gestión no disponible" (activa tu WireGuard).
      if (data.code === 'MIKROTIK_UNREACHABLE' || data.unreachable === true) {
        window.dispatchEvent(new CustomEvent('router_unreachable', { detail: data.message }));
      }
    } catch { /* no-op si el body no es JSON */ }
  }

  return response;
};
