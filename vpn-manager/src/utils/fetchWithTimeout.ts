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
  const timeoutController = new AbortController();
  const composedSignal = composeAbortSignals(options?.signal, timeoutController.signal);
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  try {
    return await apiFetch(url, {
      ...options,
      signal: composedSignal.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    composedSignal.cleanup();
  }
}

function composeAbortSignals(
  callerSignal: AbortSignal | null | undefined,
  timeoutSignal: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  if (!callerSignal) {
    return { signal: timeoutSignal, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal.reason);
  const abortFromTimeout = () => controller.abort(timeoutSignal.reason);

  if (callerSignal.aborted) {
    abortFromCaller();
  } else {
    callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }

  if (timeoutSignal.aborted) {
    abortFromTimeout();
  } else {
    timeoutSignal.addEventListener('abort', abortFromTimeout, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      callerSignal.removeEventListener('abort', abortFromCaller);
      timeoutSignal.removeEventListener('abort', abortFromTimeout);
    },
  };
}
