import type {
  AirOsAiAnalysis,
  AirOsAiNetworkSelection,
  AirOsNetworkScoreSummary,
  AirOsRiskLevel,
  AirOsRiskReason,
} from '@gestionvpn/contracts';
import type { ScannedDevice } from '../../../../types/devices';

export interface AirOsNetworkReportDevice {
  index: number;
  alias: string;
  name: string;
  ip: string;
  model: string;
  apName: string;
  score: number;
  level: AirOsRiskLevel;
  signal: number | null;
  noiseFloor: number | null;
  snr: number | null;
  ccq: number | null;
  txRate: number | null;
  rxRate: number | null;
  txLatency: number | null;
  reasons: AirOsRiskReason[];
}

export interface AirOsNetworkReportData {
  analysis: AirOsAiAnalysis;
  devices: AirOsNetworkReportDevice[];
  summary: AirOsNetworkScoreSummary;
  snapshotAt: number;
  subnet?: string;
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function buildAirOsNetworkReportData(args: {
  analysis: AirOsAiAnalysis;
  selection: AirOsAiNetworkSelection;
  devices: ScannedDevice[];
  snapshotAt: number;
  subnet?: string;
}): AirOsNetworkReportData {
  const devices = args.selection.devices.map(selected => {
    const device = args.devices[selected.index];
    const stats = device?.cachedStats;
    return {
      index: selected.index,
      alias: selected.alias,
      name: stats?.deviceName || device?.name || selected.alias,
      ip: device?.ip || '—',
      model: stats?.deviceModel || device?.model || '—',
      apName: device?.parentAp || stats?.essid || device?.essid || 'No identificado',
      score: selected.score,
      level: selected.level,
      signal: finite(stats?.signal),
      noiseFloor: finite(stats?.noiseFloor),
      snr: selected.derived.snrDb,
      ccq: finite(stats?.ccq),
      txRate: finite(stats?.txRate),
      rxRate: finite(stats?.rxRate),
      txLatency: finite(stats?.txLatency),
      reasons: selected.reasons,
    } satisfies AirOsNetworkReportDevice;
  });

  return {
    analysis: args.analysis,
    devices,
    summary: args.selection.summary,
    snapshotAt: args.snapshotAt,
    subnet: args.subnet,
  };
}

export const RISK_LABELS: Record<AirOsRiskLevel, string> = {
  healthy: 'Saludable',
  observation: 'Observación',
  deficient: 'Deficiente',
  bad: 'Malo',
  critical: 'Crítico',
};
