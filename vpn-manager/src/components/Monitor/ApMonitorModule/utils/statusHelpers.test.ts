import { describe, expect, it } from 'vitest';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import { AP_POLL_STALE_MS, getApStatus, getNodeApStatus } from './statusHelpers';

const device = {
  id: 'ap-1',
  nodeName: 'TORRE-1',
} as SavedDevice;

function poll(overrides: Partial<PollResult> = {}): PollResult {
  return {
    stations: [],
    polledAt: 1_000_000,
    loading: false,
    ...overrides,
  };
}

describe('getApStatus', () => {
  it('considera online un poll reciente exitoso aunque tenga cero CPE', () => {
    expect(getApStatus(
      device,
      { 'ap-1': poll() },
      'TORRE-1',
      true,
      1_000_000 + 1_000,
    )).toBe('online');
  });

  it('marca parcial un snapshot vencido o con error', () => {
    expect(getApStatus(
      device,
      { 'ap-1': poll() },
      'TORRE-1',
      true,
      1_000_000 + AP_POLL_STALE_MS + 1,
    )).toBe('partial');

    expect(getApStatus(
      device,
      { 'ap-1': poll({ error: 'timeout' }) },
      'TORRE-1',
      true,
      1_000_100,
    )).toBe('partial');
  });
});

describe('getNodeApStatus', () => {
  it('solo declara online cuando todos los AP están online', () => {
    expect(getNodeApStatus(['online', 'online'])).toBe('online');
    expect(getNodeApStatus(['online', 'inactive'])).toBe('partial');
    expect(getNodeApStatus(['online', 'partial'])).toBe('partial');
  });
});
