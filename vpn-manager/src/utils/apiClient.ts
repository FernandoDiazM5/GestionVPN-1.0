let globalToken = '';

export const setApiToken = (token: string) => {
  globalToken = token;
};

export const getApiToken = () => globalToken;

/**
 * Reemplazo tipado para window.fetch nativo que inyecta automáticamente el JWT
 * para todas las peticiones a la API local.
 */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);
  if (globalToken) {
    headers.set('Authorization', `Bearer ${globalToken}`);
  }

  // Prevenir que fetch sobreescriba headers preexistentes (como Content-Type JSON)
  // a menos que vengamos de FormData que requiere que el browser ponga el boundary
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    if (typeof init?.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  // Interceptar 401 Unauthorized y 403 Forbidden (Token Expirado o Inválido)
  // El backend emite 401 si no hay token y 403 si el token está corrupto/expirado
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
