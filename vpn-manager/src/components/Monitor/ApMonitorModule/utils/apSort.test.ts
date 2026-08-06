import { describe, expect, it } from 'vitest';
import type { PollResult } from '../../../../types/apMonitor';
import type { SavedDevice } from '../../../../types/devices';
import type { ApStatus } from './statusHelpers';
import { parseUptimeSeconds, sortAps, type ApSortConfig } from './apSort';

const device = (id: string, name: string, overrides: Partial<SavedDevice> = {}): SavedDevice => ({
  id, mac: id, ip: `10.0.0.${id.length}`, name, model: '', firmware: '', role: 'ap',
  nodeId: 'NODE-1', nodeName: 'Sitio', addedAt: 1, ...overrides,
});

const poll = (count: number): PollResult => ({
  stations: Array.from({ length: count }, (_, index) => ({ mac: `00:00:00:00:00:${index}` })),
  polledAt: 1, loading: false,
});

const statuses: Record<string, ApStatus> = { a: 'online', b: 'partial', c: 'inactive' };
const run = (devices: SavedDevice[], config: ApSortConfig, polls: Record<string, PollResult> = {}) =>
  sortAps(devices, config, polls, statuses).map(item => item.id);

describe('orden de equipos guardados por sitio', () => {
  it('convierte el tiempo en línea a segundos reales', () => {
    expect(parseUptimeSeconds('15d 03:35:19')).toBe(1_308_919);
    expect(parseUptimeSeconds('2 days, 01:00:00')).toBe(176_400);
    expect(parseUptimeSeconds('4h 5m 6s')).toBe(14_706);
    expect(parseUptimeSeconds(null)).toBeNull();
  });

  it('ordena texto de forma natural y estable', () => {
    const devices = [device('a', 'Antena 10'), device('b', 'Antena 2'), device('c', 'antena 1')];
    expect(run(devices, { key: 'nombre', direction: 'asc' })).toEqual(['c', 'b', 'a']);
    expect(run(devices, { key: 'nombre', direction: 'desc' })).toEqual(['a', 'b', 'c']);
  });

  it('ordena métricas numéricas y deja ausentes al final en ambas direcciones', () => {
    const devices = [
      device('a', 'A', { cachedStats: { signal: -55 } }),
      device('b', 'B', { cachedStats: { signal: -78 } }),
      device('c', 'C'),
    ];
    expect(run(devices, { key: 'signal', direction: 'asc' })).toEqual(['b', 'a', 'c']);
    expect(run(devices, { key: 'signal', direction: 'desc' })).toEqual(['a', 'b', 'c']);
  });

  it('ordena clientes actuales con fallback al último conteo conocido', () => {
    const devices = [device('a', 'A', { lastCpeCount: 8 }), device('b', 'B', { lastCpeCount: 2 }), device('c', 'C')];
    expect(run(devices, { key: 'cpes', direction: 'desc' }, { b: poll(12) })).toEqual(['b', 'a', 'c']);
  });

  it('prioriza operativamente los estados al ordenar ascendente', () => {
    const devices = [device('a', 'A'), device('b', 'B'), device('c', 'C')];
    expect(run(devices, { key: 'estado', direction: 'asc' })).toEqual(['b', 'c', 'a']);
    expect(run(devices, { key: 'estado', direction: 'desc' })).toEqual(['a', 'c', 'b']);
  });

  it('conserva el orden recibido cuando no hay configuración', () => {
    const devices = [device('c', 'C'), device('a', 'A'), device('b', 'B')];
    expect(sortAps(devices, null, {}, statuses)).toBe(devices);
  });
});
