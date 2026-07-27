import { act, renderHook } from '@testing-library/react';
import {
  AP_POLL_CACHE_KEY,
  AP_POLL_CACHE_TTL_MS,
  AP_POLL_PERSIST_INTERVAL_MS,
  mergeApPollEvent,
  persistPollResultsCache,
  readPollResultsCache,
  usePolling,
} from './usePolling';
import type { PollResult } from '../../../../types/apMonitor';

describe('usePolling persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('agrupa actualizaciones rapidas en una sola escritura compacta', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => usePolling([], null));
    const makeResult = (signal: number): Record<string, PollResult> => ({
      'ap-1': {
        stations: [{
          mac: 'AA:BB:CC:DD:EE:FF',
          signal,
          tx_bytes: 99_999,
          remote_cpuload: 88,
        }],
        polledAt: 1_000 + signal,
        loading: true,
        error: 'error transitorio',
      },
    });

    act(() => { result.current.setPollResults(makeResult(-70)); });
    act(() => { result.current.setPollResults(makeResult(-65)); });
    act(() => { result.current.setPollResults(makeResult(-60)); });

    act(() => { vi.advanceTimersByTime(AP_POLL_PERSIST_INTERVAL_MS - 1); });
    expect(setItem).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(setItem).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(sessionStorage.getItem(AP_POLL_CACHE_KEY) ?? '{}');
    expect(payload.results['ap-1']).toMatchObject({ loading: false, polledAt: 940 });
    expect(payload.results['ap-1'].error).toBeUndefined();
    expect(payload.results['ap-1'].stations[0]).toMatchObject({
      mac: 'AA:BB:CC:DD:EE:FF',
      signal: -60,
    });
    expect(payload.results['ap-1'].stations[0].tx_bytes).toBeUndefined();
    expect(payload.results['ap-1'].stations[0].remote_cpuload).toBeUndefined();
  });

  it('descarta una instantanea vencida', () => {
    const now = 10_000_000;
    persistPollResultsCache(sessionStorage, {
      'ap-1': { stations: [], polledAt: now - 1_000, loading: false },
    }, now - AP_POLL_CACHE_TTL_MS - 1);

    expect(readPollResultsCache(sessionStorage, now)).toEqual({});
    expect(sessionStorage.getItem(AP_POLL_CACHE_KEY)).toBeNull();
  });
});

describe('mergeApPollEvent', () => {
  it('ignora un evento SSE anterior al último intento ya aplicado', () => {
    const current: PollResult = {
      stations: [{ mac: 'AA:AA:AA:AA:AA:AA', signal: -55 }],
      polledAt: 2_000,
      lastAttemptAt: 2_000,
      loading: false,
    };

    expect(mergeApPollEvent(current, {
      apId: 'ap-1',
      stations: [{ mac: 'BB:BB:BB:BB:BB:BB', signal: -80 }],
      polledAt: 1_000,
    })).toBe(current);
  });

  it('conserva el último snapshot bueno cuando llega un error más reciente', () => {
    const current: PollResult = {
      stations: [{ mac: 'AA:AA:AA:AA:AA:AA', signal: -55 }],
      polledAt: 2_000,
      lastAttemptAt: 2_000,
      loading: true,
    };
    const merged = mergeApPollEvent(current, {
      apId: 'ap-1',
      error: 'SSH timeout',
      polledAt: 3_000,
    });

    expect(merged.stations).toEqual(current.stations);
    expect(merged.polledAt).toBe(2_000);
    expect(merged.lastAttemptAt).toBe(3_000);
    expect(merged.error).toBe('SSH timeout');
    expect(merged.loading).toBe(false);
  });
});
