// ============================================================
//  apiClient.ts — wrapper sobre fetch para las APIs del backend.
//
//  FASE 5: dejó de inyectar `Authorization: Bearer`. La sesión
//  ahora viaja en la cookie HttpOnly `vpn_session` que el navegador
//  manda sola gracias a `credentials: 'include'`. setApiToken/
//  getApiToken se conservan como NO-OP por compatibilidad (hay
//  componentes legacy que aún los importan, pero ya no hacen falta).
//
//  Para código nuevo, prefiere `services/sessionClient.ts` (get/post/
//  patch/del con tipos y disparo de 'auth_expired' en 401).
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const setApiToken = (_token: string) => { /* no-op tras F5: cookie HttpOnly */ };
export const getApiToken = (): string => '';

/**
 * Wrapper tipado de fetch que:
 *  - añade `credentials: 'include'` para enviar la cookie de sesión RBAC,
 *  - dispara 'auth_expired' en 401/403 fuera de /api/auth/,
 *  - emite 'mikrotik_needs_config' al recibir 503 con `needsConfig: true`.
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

  // Interceptar 503 Service Unavailable — MikroTik no configurado
  if (response.status === 503) {
    // Clonar para no consumir el body original
    const clone = response.clone();
    try {
      const data = await clone.json();
      if (data.needsConfig) {
        window.dispatchEvent(new CustomEvent('mikrotik_needs_config', { detail: data.message }));
      }
    } catch { /* no-op si el body no es JSON */ }
  }

  return response;
};
