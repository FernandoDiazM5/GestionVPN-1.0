import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountApi } from '../../services/accountApi';
import { useSessionExpiry } from './useSessionExpiry';

vi.mock('../../services/accountApi', () => ({
  accountApi: {
    sessionStatus: vi.fn(),
    renewSession: vi.fn(),
  },
}));

describe('useSessionExpiry', () => {
  beforeEach(() => {
    vi.mocked(accountApi.sessionStatus).mockReset();
    vi.mocked(accountApi.sessionStatus).mockResolvedValue({
      success: true,
      expiresAt: Date.now() + 60_000,
    });
  });

  it('revalida la sesion cuando la pagina vuelve desde el cache o reposo', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useSessionExpiry(true, logout));
    await waitFor(() => expect(accountApi.sessionStatus).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));

    await waitFor(() => expect(accountApi.sessionStatus).toHaveBeenCalledTimes(2));
  });

  it('revalida al recuperar visibilidad', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useSessionExpiry(true, logout));
    await waitFor(() => expect(accountApi.sessionStatus).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(accountApi.sessionStatus).toHaveBeenCalledTimes(2));
  });
});
