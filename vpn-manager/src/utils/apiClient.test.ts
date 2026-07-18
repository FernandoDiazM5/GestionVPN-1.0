import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './apiClient';

afterEach(() => {
  document.cookie = 'vpn_csrf=; Max-Age=0; path=/';
  vi.restoreAllMocks();
});

describe('apiFetch CSRF', () => {
  it('envÃ­a el token CSRF antes de ejecutar una mutaciÃ³n', async () => {
    document.cookie = 'vpn_csrf=legacy-client-token; path=/';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await apiFetch('/api/settings/save', { method: 'POST', body: '{}' });

    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('legacy-client-token');
    expect(init?.credentials).toBe('include');
  });
});
