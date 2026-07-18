const CSRF_COOKIE_NAME = 'vpn_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${CSRF_COOKIE_NAME}=`;
  const item = document.cookie.split(';').map(value => value.trim())
    .find(value => value.startsWith(prefix));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(prefix.length)); } catch { return null; }
}

export function addCsrfHeader(headers: Headers, method: string | undefined): Headers {
  const normalizedMethod = (method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(normalizedMethod) || headers.has('X-CSRF-Token')) return headers;
  const token = readCsrfToken();
  if (token) headers.set('X-CSRF-Token', token);
  return headers;
}
