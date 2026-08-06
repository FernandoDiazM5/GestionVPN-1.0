import type { PollResult } from '../../../../types/apMonitor';
import type { SavedDevice } from '../../../../types/devices';
import type { ApStatus } from './statusHelpers';

export type ApSortKey = 'modo' | 'nombre' | 'modelo' | 'ssid' | 'signal' | 'ccq' | 'txpwr' | 'uptime' | 'cpu' | 'cpes' | 'estado';
export type ApSortDirection = 'asc' | 'desc';
export interface ApSortConfig { key: ApSortKey; direction: ApSortDirection }

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const STATUS_RANK: Record<ApStatus, number> = { partial: 0, inactive: 1, connecting: 2, online: 3 };
const STORAGE_PREFIX = 'ap_monitor_ap_sort_v1:';

function parseUptimeSeconds(value?: string | null): number | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  let seconds = 0;
  let matched = false;
  const days = normalized.match(/(\d+)\s*(?:d|day|days|día|días)\b/);
  if (days) { seconds += Number(days[1]) * 86_400; matched = true; }
  const clock = normalized.match(/(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?/);
  if (clock) {
    seconds += Number(clock[1]) * 3_600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0);
    matched = true;
  } else {
    const hours = normalized.match(/(\d+)\s*h\b/);
    const minutes = normalized.match(/(\d+)\s*m\b/);
    const secs = normalized.match(/(\d+)\s*s\b/);
    if (hours) { seconds += Number(hours[1]) * 3_600; matched = true; }
    if (minutes) { seconds += Number(minutes[1]) * 60; matched = true; }
    if (secs) { seconds += Number(secs[1]); matched = true; }
  }
  return matched ? seconds : null;
}

function apSortValue(dev: SavedDevice, poll: PollResult | undefined, status: ApStatus, key: ApSortKey): string | number | null {
  const stats = dev.cachedStats;
  switch (key) {
    case 'modo': return stats?.mode ?? dev.role ?? null;
    case 'nombre': return stats?.deviceName ?? dev.deviceName ?? dev.name ?? dev.ip;
    case 'modelo': return stats?.deviceModel ?? dev.model ?? null;
    case 'ssid': {
      const ssid = stats?.essid ?? dev.essid;
      const channel = stats?.channelWidth ?? dev.channelWidth;
      return ssid ? `${ssid} ${channel ?? ''}`.trim() : null;
    }
    case 'signal': return stats?.signal ?? null;
    case 'ccq': return stats?.ccq ?? null;
    case 'txpwr': return stats?.txPower ?? null;
    case 'uptime': return parseUptimeSeconds(stats?.uptimeStr);
    case 'cpu': return stats?.cpuLoad ?? null;
    case 'cpes': return poll?.stations.length ?? dev.lastCpeCount ?? null;
    case 'estado': return STATUS_RANK[status];
  }
}

function sortAps(
  devices: SavedDevice[],
  config: ApSortConfig | null,
  pollResults: Record<string, PollResult>,
  statuses: Record<string, ApStatus>,
): SavedDevice[] {
  if (!config) return devices;
  return devices
    .map((device, index) => ({ device, index }))
    .sort((a, b) => {
      const av = apSortValue(a.device, pollResults[a.device.id], statuses[a.device.id], config.key);
      const bv = apSortValue(b.device, pollResults[b.device.id], statuses[b.device.id], config.key);
      const aMissing = av == null || av === '' || (typeof av === 'number' && !Number.isFinite(av));
      const bMissing = bv == null || bv === '' || (typeof bv === 'number' && !Number.isFinite(bv));
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) return a.index - b.index;
      const comparison = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : collator.compare(String(av), String(bv));
      return (config.direction === 'asc' ? comparison : -comparison) || a.index - b.index;
    })
    .map(item => item.device);
}

function loadApSort(nodeId: string): ApSortConfig | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${nodeId}`) ?? 'null') as ApSortConfig | null;
    if (parsed && ['asc', 'desc'].includes(parsed.direction) && AP_SORT_KEYS.has(parsed.key)) return parsed;
  } catch { /* Preferencia inválida o storage no disponible. */ }
  return null;
}

function saveApSort(nodeId: string, config: ApSortConfig | null) {
  try {
    const key = `${STORAGE_PREFIX}${nodeId}`;
    if (config) localStorage.setItem(key, JSON.stringify(config));
    else localStorage.removeItem(key);
  } catch { /* Storage no disponible. */ }
}

const AP_SORT_KEYS = new Set<ApSortKey>(['modo', 'nombre', 'modelo', 'ssid', 'signal', 'ccq', 'txpwr', 'uptime', 'cpu', 'cpes', 'estado']);

export { AP_SORT_KEYS, loadApSort, parseUptimeSeconds, saveApSort, sortAps };
