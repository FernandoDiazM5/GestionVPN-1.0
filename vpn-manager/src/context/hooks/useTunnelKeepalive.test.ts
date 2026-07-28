import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { API_BASE_URL } from '../../config';
import { server } from '../../test/setup';
import type { RouterCredentials } from '../../store/db';
import { TUNNEL_KEEPALIVE_MS } from '../constants';
import { useTunnelKeepalive } from './useTunnelKeepalive';

const credentials: RouterCredentials = { user: 'member@example.test', role: 'user' };

afterEach(() => {
  vi.useRealTimers();
});

it('actualiza la expiración local con cada lease confirmado por backend', async () => {
  vi.useFakeTimers();
  const renewedExpiry = Date.now() + 5 * 60_000;
  const setTunnelExpiry = vi.fn();
  server.use(
    http.post(`${API_BASE_URL}/api/tunnel/keepalive`, () =>
      HttpResponse.json({ success: true, restored: false, tunnelExpiry: renewedExpiry }),
    ),
  );

  renderHook(() =>
    useTunnelKeepalive(
      Date.now() + 5 * 60_000,
      credentials,
      'vrf-node-1',
      setTunnelExpiry,
    ),
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(TUNNEL_KEEPALIVE_MS);
  });

  expect(setTunnelExpiry).toHaveBeenCalledWith(renewedExpiry);
});
