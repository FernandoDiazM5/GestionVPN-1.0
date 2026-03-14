/**
 * Wrapper de fetch con AbortController.
 * Cancela la petición si supera `timeoutMs` (por defecto 10 segundos).
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`La petición tardó más de ${timeoutMs / 1000}s y fue cancelada.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
