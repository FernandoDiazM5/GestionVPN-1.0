import { API_BASE_URL } from '../config';
import { addCsrfHeader } from '../utils/csrf';

export type FrontendErrorSource = 'render' | 'window-error' | 'unhandled-rejection' | 'async';

interface ErrorContext {
  source: FrontendErrorSource;
  componentStack?: string;
  route?: string;
}

const recent = new Map<string, number>();
const DEDUPE_MS = 60_000;

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try { return new Error(JSON.stringify(value)); } catch { return new Error('Error desconocido'); }
}

function trim(value: string | undefined, max: number): string | undefined {
  return value ? value.slice(0, max) : undefined;
}

function keyFor(error: Error, context: ErrorContext): string {
  return [context.source, error.name, error.message, context.route].join('|');
}

export function reportFrontendError(value: unknown, context: ErrorContext): void {
  const error = normalizeError(value);
  const route = context.route ?? (typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}`
    : 'unknown');
  const key = keyFor(error, { ...context, route });
  const now = Date.now();
  if (now - (recent.get(key) || 0) < DEDUPE_MS) return;
  recent.set(key, now);

  const payload = {
    source: context.source,
    name: trim(error.name || 'Error', 80),
    message: trim(error.message || 'Error desconocido', 1_000),
    stack: trim(error.stack, 4_000),
    componentStack: trim(context.componentStack, 4_000),
    route: trim(route, 500),
    userAgent: typeof navigator !== 'undefined' ? trim(navigator.userAgent, 500) : undefined,
    occurredAt: now,
  };

  const headers = addCsrfHeader(new Headers({ 'Content-Type': 'application/json' }), 'POST');
  void fetch(`${API_BASE_URL}/api/error-reports`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers,
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

let installed = false;

export function installGlobalErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', event => {
    reportFrontendError(event.error ?? event.message, { source: 'window-error' });
  });
  window.addEventListener('unhandledrejection', event => {
    reportFrontendError(event.reason, { source: 'unhandled-rejection' });
  });
}
