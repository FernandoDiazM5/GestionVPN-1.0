import { apiFetch } from './apiClient';

/**
 * Fetch con timeout automático para evitar que las peticiones queden colgadas.
 * Conserva la cookie HttpOnly de sesión mediante apiFetch.
 * @param url URL a fetchear
 * @param options Opciones de fetch (sin timeout)
 * @param timeoutMs Tiempo máximo en milisegundos (default 30000)
 * @returns Promise<Response>
 */
export async function fetchWithTimeout(
  url: string | URL,
  options?: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await apiFetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
