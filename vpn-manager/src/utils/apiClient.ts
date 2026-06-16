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

  const response = await fetch(input, {
    ...init,
    credentials: 'include',   // envía cookie HttpOnly de sesión RBAC
    headers,
  });

  // Interceptar 401 Unauthorized y 403 Forbidden (sesión inválida o expirada)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
  const isAuthRoute = url.includes('/api/auth/');
  if (!isAuthRoute && (response.status === 401 || response.status === 403)) {
    window.dispatchEvent(new Event('auth_expired'));
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
