import type {
  AirOsNetworkScoreResult,
  AirOsAiAnalysisResult,
  AirOsAiDevice,
  AirOsAiDeviceIdentity,
  AirOsAiDeviceAnalysisRequest,
  AirOsAiNetworkAnalysisRequest,
  AirOsAiStatus,
  AirOsAiHistoryDetail,
  AirOsAiHistoryItem,
} from '@gestionvpn/contracts';
import { assessAirOsNetwork } from '@gestionvpn/contracts';
import type { AntennaStats, ScannedDevice, SavedDevice } from '../types/devices';
import { del, get, post } from './sessionClient';

const METRIC_KEYS = [
  'signal', 'noiseFloor', 'ccq', 'txRate', 'rxRate', 'cpuLoad', 'memoryPercent',
  'airmaxQuality', 'airmaxCapacity', 'uptimeStr', 'firmwareVersion', 'mode',
  'networkMode', 'frequency', 'channelNumber', 'channelWidth', 'txPower',
  'distance', 'chains', 'rssi', 'txRetries', 'missedBeacons', 'rxCrypts',
  'chainRssi', 'opmode', 'countryCode', 'temperature', 'loadAvg', 'lanSpeed',
  'lanInfo', 'cinr', 'airtime', 'txAirtime', 'rxAirtime', 'txLatency',
] as const satisfies readonly (keyof AntennaStats)[];

const NETWORK_METRIC_KEYS = [
  'signal', 'noiseFloor', 'ccq', 'txRate', 'rxRate', 'airmaxQuality',
  'airmaxCapacity', 'txRetries', 'lanSpeed', 'txLatency', 'channelWidth',
] as const satisfies readonly (keyof AntennaStats)[];

export function roleOf(device: ScannedDevice | SavedDevice): AirOsAiDevice['role'] {
  const raw = String(device.cachedStats?.mode || device.role || '').trim().toLowerCase();
  if (raw === 'ap' || raw === 'master' || raw.includes('access point') || raw.startsWith('ap-') || raw.startsWith('ap_')) return 'ap';
  if (raw === 'sta' || raw === 'station' || raw === 'client' || raw === 'subscriber' || raw.startsWith('sta-') || raw.startsWith('sta_') || raw.startsWith('station-')) return 'sta';
  return 'unknown';
}

export function buildAirOsNetworkPreview(devices: Array<ScannedDevice | SavedDevice>): AirOsNetworkScoreResult {
  return assessAirOsNetwork(devices.map(device => {
    const normalized = toAirOsAiDevice(device);
    const ap = normalized.parentAp || normalized.essid;
    const width = normalized.cachedStats.channelWidth;
    return {
      role: normalized.role,
      groupKey: ap ? `${ap}|${width || 'width-unknown'}` : null,
      metrics: normalized.cachedStats,
    };
  }), 10);
}

/** Construye exclusivamente la allowlist pública; nunca copia el objeto completo. */
function toAirOsAiDeviceWithMetrics(
  device: ScannedDevice | SavedDevice,
  metricKeys: readonly (keyof AntennaStats)[],
): AirOsAiDevice {
  const source = device.cachedStats || {};
  const cachedStats: Record<string, unknown> = {};
  for (const key of metricKeys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') cachedStats[key] = value;
  }
  return {
    ip: device.ip,
    mac: source.wlanMac || device.mac || '',
    name: source.deviceName || device.name || '',
    model: source.deviceModel || device.model || '',
    firmware: source.firmwareVersion || device.firmware || '',
    role: roleOf(device),
    essid: source.essid || device.essid,
    parentAp: device.parentAp,
    cachedStats: cachedStats as AirOsAiDevice['cachedStats'],
  };
}

export function toAirOsAiDevice(device: ScannedDevice | SavedDevice): AirOsAiDevice {
  return toAirOsAiDeviceWithMetrics(device, METRIC_KEYS);
}

/** Reduce también el tráfico navegador-servidor para el análisis general. */
export function toAirOsAiNetworkDevice(device: ScannedDevice | SavedDevice): AirOsAiDevice {
  return toAirOsAiDeviceWithMetrics(device, NETWORK_METRIC_KEYS);
}

/** Envía sólo la identidad necesaria para que el backend derive la huella HMAC. */
export function toAirOsAiIdentity(device: ScannedDevice | SavedDevice): AirOsAiDeviceIdentity {
  const source = device.cachedStats;
  return {
    ip: device.ip,
    mac: source?.wlanMac || device.mac || '',
    name: source?.deviceName || device.name || '',
    model: source?.deviceModel || device.model || '',
  };
}

export const airOsAiApi = {
  status: () => get<{ success: true; status: AirOsAiStatus }>('/api/ai/air-os/status'),
  consent: (policyVersion: string, accepted: boolean) =>
    post<{ success: true; accepted: boolean; policyVersion: string }>('/api/ai/air-os/consent', { policyVersion, accepted }),
  analyzeDevice: (request: AirOsAiDeviceAnalysisRequest) =>
    post<{ success: true; result: AirOsAiAnalysisResult }>('/api/ai/air-os/device-analysis', request),
  analyzeNetwork: (request: AirOsAiNetworkAnalysisRequest) =>
    post<{ success: true; result: AirOsAiAnalysisResult }>('/api/ai/air-os/network-analysis', request),
  listAnalyses: (type?: 'DEVICE' | 'NETWORK') =>
    get<{ success: true; analyses: AirOsAiHistoryItem[]; retentionDays: number }>(
      `/api/ai/air-os/analyses?limit=30${type ? `&type=${type}` : ''}`,
    ),
  listDeviceAnalyses: (device: ScannedDevice | SavedDevice) =>
    post<{ success: true; analyses: AirOsAiHistoryItem[]; retentionDays: number }>(
      '/api/ai/air-os/analyses/device-history',
      { device: toAirOsAiIdentity(device), limit: 30 },
    ),
  getAnalysis: (uuid: string) =>
    get<{ success: true; analysis: AirOsAiHistoryDetail }>(`/api/ai/air-os/analyses/${encodeURIComponent(uuid)}`),
  deleteAnalysis: (uuid: string) =>
    del<{ success: true; message: string }>(`/api/ai/air-os/analyses/${encodeURIComponent(uuid)}`),
};
