import type { SavedDevice } from '../../../../types/devices';
import type { LiveCpe, PollResult } from '../../../../types/apMonitor';
import { cpeHealth, type HealthLevel } from './health';
import { AP_POLL_STALE_MS } from './statusHelpers';
import type { NodeGroup } from './types';

export type ApReportDataStatus = 'fresh' | 'stale' | 'error' | 'no-data';

export interface NodeApReportCpe {
  apName: string;
  name: string;
  ip: string;
  mac: string;
  model: string;
  signalAp: number | null;
  signalCpe: number | null;
  noiseFloor: number | null;
  snr: number | null;
  ccq: number | null;
  txRate: number | null;
  rxRate: number | null;
  airmaxQuality: number | null;
  airmaxCapacity: number | null;
  distance: number | null;
  uptime: string;
  health: HealthLevel;
}

export interface NodeApReportAp {
  id: string;
  name: string;
  ip: string;
  model: string;
  firmware: string;
  lanMac: string;
  wlanMac: string;
  ssid: string;
  security: string;
  mode: string;
  networkMode: string;
  chains: string;
  frequency: number | null;
  channelWidth: number | null;
  txPower: number | null;
  signal: number | null;
  noiseFloor: number | null;
  ccq: number | null;
  airmaxQuality: number | null;
  airmaxCapacity: number | null;
  cpuLoad: number | null;
  memoryPercent: number | null;
  uptime: string;
  temperature: number | null;
  lanSpeed: number | null;
  distance: number | null;
  cpeCount: number;
  cpeCountIsHistorical: boolean;
  status: ApReportDataStatus;
  polledAt: number;
  error: string;
  hasSsh: boolean;
  cpes: NodeApReportCpe[];
}

export interface NodeApReport {
  nodeId: string;
  nodeName: string;
  generatedAt: number;
  lastDataAt: number;
  summary: {
    apTotal: number;
    apFresh: number;
    apStale: number;
    apError: number;
    apNoData: number;
    apWithoutSsh: number;
    cpeTotal: number;
    cpeDegraded: number;
    cpeCritical: number;
  };
  aps: NodeApReportAp[];
}

function valueOrNull(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

function apName(device: SavedDevice): string {
  return device.cachedStats?.deviceName || device.deviceName || device.name || device.ip;
}

function cpeName(cpe: LiveCpe): string {
  return cpe.remote_hostname || cpe.cpe_name || cpe.hostname || cpe.mac;
}

function reportDataStatus(poll: PollResult | undefined, now: number): ApReportDataStatus {
  if (poll?.error) return 'error';
  if (!poll?.polledAt) return 'no-data';
  return now - poll.polledAt > AP_POLL_STALE_MS ? 'stale' : 'fresh';
}

function buildCpe(device: SavedDevice, cpe: LiveCpe): NodeApReportCpe {
  const signalAp = valueOrNull(cpe.signal);
  const noiseFloor = valueOrNull(cpe.noisefloor);
  return {
    apName: apName(device),
    name: cpeName(cpe),
    ip: cpe.lastip || '',
    mac: cpe.mac,
    model: cpe.cpe_product || cpe.modelo || '',
    signalAp,
    signalCpe: valueOrNull(cpe.remote_signal),
    noiseFloor,
    snr: signalAp != null && noiseFloor != null ? signalAp - noiseFloor : null,
    ccq: valueOrNull(cpe.ccq),
    txRate: valueOrNull(cpe.tx_rate),
    rxRate: valueOrNull(cpe.rx_rate),
    airmaxQuality: valueOrNull(cpe.airmax_quality),
    airmaxCapacity: valueOrNull(cpe.airmax_capacity),
    distance: valueOrNull(cpe.distance),
    uptime: cpe.uptimeStr || '',
    health: cpeHealth(cpe),
  };
}

export function buildNodeApReport(
  group: NodeGroup,
  pollResults: Record<string, PollResult>,
  generatedAt = Date.now(),
): NodeApReport {
  const aps = group.aps.map((device): NodeApReportAp => {
    const poll = pollResults[device.id];
    const stats = device.cachedStats;
    return {
      id: device.id,
      name: apName(device),
      ip: device.ip,
      model: stats?.deviceModel || device.model || '',
      firmware: stats?.firmwareVersion || device.firmware || '',
      lanMac: stats?.lanMac || device.lanMac || '',
      wlanMac: stats?.wlanMac || device.wlanMac || '',
      ssid: stats?.essid || device.essid || '',
      security: stats?.security || device.security || '',
      mode: stats?.mode || device.role,
      networkMode: stats?.networkMode || device.networkMode || '',
      chains: stats?.chains || device.chains || '',
      frequency: valueOrNull(stats?.frequency ?? device.frequency),
      channelWidth: valueOrNull(stats?.channelWidth ?? device.channelWidth),
      txPower: valueOrNull(stats?.txPower),
      signal: valueOrNull(stats?.signal),
      noiseFloor: valueOrNull(stats?.noiseFloor),
      ccq: valueOrNull(stats?.ccq),
      airmaxQuality: valueOrNull(stats?.airmaxQuality),
      airmaxCapacity: valueOrNull(stats?.airmaxCapacity),
      cpuLoad: valueOrNull(stats?.cpuLoad),
      memoryPercent: valueOrNull(stats?.memoryPercent),
      uptime: stats?.uptimeStr || '',
      temperature: valueOrNull(stats?.temperature),
      lanSpeed: valueOrNull(stats?.lanSpeed),
      distance: valueOrNull(stats?.distance),
      cpeCount: poll?.stations.length ?? device.lastCpeCount ?? 0,
      cpeCountIsHistorical: !poll && device.lastCpeCount != null,
      status: reportDataStatus(poll, generatedAt),
      polledAt: poll?.polledAt ?? 0,
      error: poll?.error || '',
      hasSsh: Boolean(device.sshUser && (device.sshPass || device.hasSshPass)),
      cpes: (poll?.stations ?? []).map(cpe => buildCpe(device, cpe)),
    };
  });

  const cpes = aps.flatMap(ap => ap.cpes);
  const summary = {
    apTotal: aps.length,
    apFresh: aps.filter(ap => ap.status === 'fresh').length,
    apStale: aps.filter(ap => ap.status === 'stale').length,
    apError: aps.filter(ap => ap.status === 'error').length,
    apNoData: aps.filter(ap => ap.status === 'no-data').length,
    apWithoutSsh: aps.filter(ap => !ap.hasSsh).length,
    cpeTotal: cpes.length,
    cpeDegraded: cpes.filter(cpe => cpe.health !== 'ok').length,
    cpeCritical: cpes.filter(cpe => cpe.health === 'critical').length,
  };

  return {
    nodeId: group.nodeId,
    nodeName: group.nodeName,
    generatedAt,
    lastDataAt: aps.reduce((latest, ap) => Math.max(latest, ap.polledAt), 0),
    summary,
    aps,
  };
}
