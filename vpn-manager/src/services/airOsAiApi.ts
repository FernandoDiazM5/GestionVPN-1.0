import type {
  AirOsAiAnalysisResult,
  AirOsAiDevice,
  AirOsAiDeviceAnalysisRequest,
  AirOsAiNetworkAnalysisRequest,
  AirOsAiStatus,
  AirOsAiHistoryDetail,
  AirOsAiHistoryItem,
} from '@gestionvpn/contracts';
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

function roleOf(device: ScannedDevice | SavedDevice): AirOsAiDevice['role'] {
  const raw = String(device.cachedStats?.mode || device.role || '').toLowerCase();
  if (raw === 'ap' || raw === 'master' || raw.startsWith('ap-') || raw.startsWith('ap_')) return 'ap';
  if (raw === 'sta' || raw.startsWith('sta-') || raw.startsWith('sta_')) return 'sta';
  return 'unknown';
}

/** Construye exclusivamente la allowlist pública; nunca copia el objeto completo. */
export function toAirOsAiDevice(device: ScannedDevice | SavedDevice): AirOsAiDevice {
  const source = device.cachedStats || {};
  const cachedStats: Record<string, unknown> = {};
  for (const key of METRIC_KEYS) {
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

export const airOsAiApi = {
  status: () => get<{ success: true; status: AirOsAiStatus }>('/api/ai/air-os/status'),
  consent: (policyVersion: string, accepted: boolean) =>
    post<{ success: true; accepted: boolean; policyVersion: string }>('/api/ai/air-os/consent', { policyVersion, accepted }),
  analyzeDevice: (request: AirOsAiDeviceAnalysisRequest) =>
    post<{ success: true; result: AirOsAiAnalysisResult }>('/api/ai/air-os/device-analysis', request),
  analyzeNetwork: (request: AirOsAiNetworkAnalysisRequest) =>
    post<{ success: true; result: AirOsAiAnalysisResult }>('/api/ai/air-os/network-analysis', request),
  listAnalyses: () =>
    get<{ success: true; analyses: AirOsAiHistoryItem[] }>('/api/ai/air-os/analyses?limit=30'),
  getAnalysis: (uuid: string) =>
    get<{ success: true; analysis: AirOsAiHistoryDetail }>(`/api/ai/air-os/analyses/${encodeURIComponent(uuid)}`),
  deleteAnalysis: (uuid: string) =>
    del<{ success: true; message: string }>(`/api/ai/air-os/analyses/${encodeURIComponent(uuid)}`),
};
