import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTunnelSync } from './useTunnelSync';

const { fetchWithTimeoutMock } = vi.hoisted(() => ({
  fetchWithTimeoutMock: vi.fn(),
}));

vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}));

class EventSourceMock {
  static instances: EventSourceMock[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor() {
    EventSourceMock.instances.push(this);
  }
}

class BroadcastChannelMock {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
}

describe('useTunnelSync', () => {
  const originalEventSource = globalThis.EventSource;
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    EventSourceMock.instances = [];
    fetchWithTimeoutMock.mockReset();
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, activeNodeVrf: null, tunnelExpiry: null }),
    });
    globalThis.EventSource = EventSourceMock as unknown as typeof EventSource;
    globalThis.BroadcastChannel = BroadcastChannelMock as unknown as typeof BroadcastChannel;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    globalThis.BroadcastChannel = originalBroadcastChannel;
  });

  it('mantiene una sola conexion al cambiar estado y la cierra al desautenticar', async () => {
    const setActiveNodeVrf = vi.fn();
    const setTunnelExpiry = vi.fn();
    const { rerender } = renderHook(
      ({ activeNodeVrf, isAuthenticated }) => useTunnelSync(
        true,
        isAuthenticated,
        activeNodeVrf,
        null,
        setActiveNodeVrf,
        setTunnelExpiry
      ),
      { initialProps: { activeNodeVrf: null as string | null, isAuthenticated: true } }
    );

    await waitFor(() => expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1));
    expect(EventSourceMock.instances).toHaveLength(1);

    rerender({ activeNodeVrf: 'vrf-client-1', isAuthenticated: true });
    expect(EventSourceMock.instances).toHaveLength(1);
    expect(EventSourceMock.instances[0].close).not.toHaveBeenCalled();

    rerender({ activeNodeVrf: 'vrf-client-1', isAuthenticated: false });
    expect(EventSourceMock.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('ignora la sincronizacion inicial si la sesion se cierra antes de responder', async () => {
    let resolveStatus!: (response: unknown) => void;
    fetchWithTimeoutMock.mockReturnValue(new Promise((resolve) => {
      resolveStatus = resolve;
    }));
    const setActiveNodeVrf = vi.fn();
    const setTunnelExpiry = vi.fn();
    const readStatus = vi.fn().mockResolvedValue({
      success: true,
      activeNodeVrf: 'vrf-stale',
      tunnelExpiry: Date.now() + 60_000,
    });
    const { unmount } = renderHook(() => useTunnelSync(
      true,
      true,
      null,
      null,
      setActiveNodeVrf,
      setTunnelExpiry
    ));

    unmount();
    resolveStatus({
      ok: true,
      json: readStatus,
    });
    await vi.waitFor(() => expect(readStatus).toHaveBeenCalledTimes(1));

    expect(EventSourceMock.instances[0].close).toHaveBeenCalledTimes(1);
    expect(setActiveNodeVrf).not.toHaveBeenCalled();
    expect(setTunnelExpiry).not.toHaveBeenCalled();
  });
});
