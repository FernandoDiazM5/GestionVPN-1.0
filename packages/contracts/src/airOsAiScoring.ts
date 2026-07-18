export type AirOsRiskLevel = 'healthy' | 'observation' | 'deficient' | 'bad' | 'critical';

export interface AirOsScoringMetrics {
  signal?: number | null;
  noiseFloor?: number | null;
  ccq?: number | null;
  txRate?: number | null;
  rxRate?: number | null;
  airmaxQuality?: number | null;
  airmaxCapacity?: number | null;
  txRetries?: number | null;
  txLatency?: number | null;
  lanSpeed?: number | null;
}

export interface AirOsNetworkScoringInput {
  role: 'ap' | 'sta' | 'unknown';
  groupKey?: string | null;
  metrics: AirOsScoringMetrics;
}

export interface AirOsRiskReason {
  code: string;
  label: string;
  value: number;
  unit: string;
  points: number;
  level: Exclude<AirOsRiskLevel, 'healthy'>;
}

export interface AirOsNetworkScoreRow {
  index: number;
  alias: string;
  role: AirOsNetworkScoringInput['role'];
  score: number;
  level: AirOsRiskLevel;
  candidate: boolean;
  derived: {
    snrDb: number | null;
    txRateRatioPct: number | null;
    rxRateRatioPct: number | null;
  };
  reasons: AirOsRiskReason[];
}

export interface AirOsNetworkScoreSummary {
  total: number;
  sta: number;
  apExcluded: number;
  unknownExcluded: number;
  healthy: number;
  observation: number;
  deficient: number;
  bad: number;
  critical: number;
  candidates: number;
  selected: number;
}

export interface AirOsNetworkScoreResult {
  rows: AirOsNetworkScoreRow[];
  selectedIndexes: number[];
  summary: AirOsNetworkScoreSummary;
}

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function levelForScore(score: number): AirOsRiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'bad';
  if (score >= 40) return 'deficient';
  if (score >= 20) return 'observation';
  return 'healthy';
}

function addReason(
  reasons: AirOsRiskReason[],
  code: string,
  label: string,
  value: number,
  unit: string,
  points: number,
  level: AirOsRiskReason['level'],
) {
  if (points > 0) reasons.push({ code, label, value, unit, points, level });
  return points;
}

function signalBand(value: number, reasons: AirOsRiskReason[]) {
  if (value <= -75) return addReason(reasons, 'SIGNAL_CRITICAL', 'Señal crítica', value, 'dBm', 35, 'critical');
  if (value <= -68) return addReason(reasons, 'SIGNAL_BAD', 'Señal mala', value, 'dBm', 25, 'bad');
  if (value <= -61) return addReason(reasons, 'SIGNAL_DEFICIENT', 'Señal deficiente', value, 'dBm', 15, 'deficient');
  if (value <= -56) return addReason(reasons, 'SIGNAL_ACCEPTABLE', 'Señal aceptable', value, 'dBm', 5, 'observation');
  return 0;
}

function ccqBand(value: number, reasons: AirOsRiskReason[]) {
  if (value <= 29) return addReason(reasons, 'CCQ_CRITICAL', 'CCQ crítico', value, '%', 35, 'critical');
  if (value <= 49) return addReason(reasons, 'CCQ_BAD', 'CCQ malo', value, '%', 25, 'bad');
  if (value <= 74) return addReason(reasons, 'CCQ_DEFICIENT', 'CCQ deficiente', value, '%', 15, 'deficient');
  if (value <= 89) return addReason(reasons, 'CCQ_ACCEPTABLE', 'CCQ aceptable', value, '%', 5, 'observation');
  return 0;
}

function snrBand(value: number, reasons: AirOsRiskReason[]) {
  if (value < 10) return addReason(reasons, 'SNR_CRITICAL', 'SNR crítico', value, 'dB', 35, 'critical');
  if (value < 18) return addReason(reasons, 'SNR_BAD', 'SNR malo', value, 'dB', 25, 'bad');
  if (value < 25) return addReason(reasons, 'SNR_DEFICIENT', 'SNR deficiente', value, 'dB', 15, 'deficient');
  if (value < 30) return addReason(reasons, 'SNR_ACCEPTABLE', 'SNR aceptable', value, 'dB', 5, 'observation');
  return 0;
}

function noiseBand(value: number, reasons: AirOsRiskReason[]) {
  if (value > -75) return addReason(reasons, 'NOISE_CRITICAL', 'Ruido crítico', value, 'dBm', 30, 'critical');
  if (value >= -79) return addReason(reasons, 'NOISE_BAD', 'Ruido alto', value, 'dBm', 20, 'bad');
  if (value >= -84) return addReason(reasons, 'NOISE_DEFICIENT', 'Ruido deficiente', value, 'dBm', 10, 'deficient');
  if (value >= -89) return addReason(reasons, 'NOISE_ACCEPTABLE', 'Ruido aceptable', value, 'dBm', 5, 'observation');
  return 0;
}

function latencyBand(value: number, reasons: AirOsRiskReason[]) {
  if (value > 50) return addReason(reasons, 'LATENCY_CRITICAL', 'Latencia TX crítica', value, 'ms', 30, 'critical');
  if (value > 35) return addReason(reasons, 'LATENCY_BAD', 'Latencia TX mala', value, 'ms', 20, 'bad');
  if (value > 20) return addReason(reasons, 'LATENCY_DEFICIENT', 'Latencia TX deficiente', value, 'ms', 10, 'deficient');
  if (value > 10) return addReason(reasons, 'LATENCY_ACCEPTABLE', 'Latencia TX aceptable', value, 'ms', 5, 'observation');
  return 0;
}

function airmaxBand(value: number, metric: 'quality' | 'capacity', reasons: AirOsRiskReason[]) {
  const prefix = metric === 'quality' ? 'Calidad airMAX' : 'Capacidad airMAX';
  const code = metric === 'quality' ? 'AIRMAX_QUALITY' : 'AIRMAX_CAPACITY';
  if (value < 30) return addReason(reasons, `${code}_CRITICAL`, `${prefix} crítica`, value, '%', 18, 'critical');
  if (value < 50) return addReason(reasons, `${code}_BAD`, `${prefix} mala`, value, '%', 12, 'bad');
  if (value < 75) return addReason(reasons, `${code}_DEFICIENT`, `${prefix} deficiente`, value, '%', 8, 'deficient');
  if (value < 90) return addReason(reasons, `${code}_ACCEPTABLE`, `${prefix} aceptable`, value, '%', 3, 'observation');
  return 0;
}

function relativeRateBand(
  value: number | null,
  baseline: number | null,
  direction: 'TX' | 'RX',
  reasons: AirOsRiskReason[],
) {
  if (value == null || baseline == null || baseline <= 0) return { points: 0, ratio: null };
  const ratio = Math.round((value / baseline) * 100);
  if (ratio < 20) return { points: addReason(reasons, `${direction}_RATE_CRITICAL`, `${direction} muy inferior al grupo`, ratio, '% del grupo', 15, 'critical'), ratio };
  if (ratio < 40) return { points: addReason(reasons, `${direction}_RATE_BAD`, `${direction} inferior al grupo`, ratio, '% del grupo', 10, 'bad'), ratio };
  if (ratio < 60) return { points: addReason(reasons, `${direction}_RATE_DEFICIENT`, `${direction} por debajo del grupo`, ratio, '% del grupo', 5, 'deficient'), ratio };
  return { points: 0, ratio };
}

export function assessAirOsNetwork(
  inputs: AirOsNetworkScoringInput[],
  maxSelected = 10,
): AirOsNetworkScoreResult {
  const staInputs = inputs.map((input, index) => ({ input, index })).filter(row => row.input.role === 'sta');
  const groupStats = new Map<string, { tx: number[]; rx: number[] }>();

  for (const { input } of staInputs) {
    const key = input.groupKey || '__network__';
    const stats = groupStats.get(key) || { tx: [], rx: [] };
    const tx = finite(input.metrics.txRate);
    const rx = finite(input.metrics.rxRate);
    if (tx != null && tx > 0) stats.tx.push(tx);
    if (rx != null && rx > 0) stats.rx.push(rx);
    groupStats.set(key, stats);
  }

  let staOrdinal = 0;
  const rows = inputs.map((input, index): AirOsNetworkScoreRow => {
    if (input.role !== 'sta') {
      return {
        index, alias: input.role === 'ap' ? 'AP' : 'UNKNOWN', role: input.role,
        score: 0, level: 'healthy', candidate: false,
        derived: { snrDb: null, txRateRatioPct: null, rxRateRatioPct: null }, reasons: [],
      };
    }

    staOrdinal += 1;
    const reasons: AirOsRiskReason[] = [];
    const metrics = input.metrics;
    const signal = finite(metrics.signal);
    const noise = finite(metrics.noiseFloor);
    const ccq = finite(metrics.ccq);
    const snr = signal != null && noise != null ? signal - noise : null;
    let score = 0;
    if (signal != null) score += signalBand(signal, reasons);
    if (ccq != null) score += ccqBand(ccq, reasons);
    if (snr != null) score += snrBand(snr, reasons);
    if (noise != null) score += noiseBand(noise, reasons);
    const latency = finite(metrics.txLatency);
    if (latency != null) score += latencyBand(latency, reasons);
    const quality = finite(metrics.airmaxQuality);
    if (quality != null) score += airmaxBand(quality, 'quality', reasons);
    const capacity = finite(metrics.airmaxCapacity);
    if (capacity != null) score += airmaxBand(capacity, 'capacity', reasons);

    const retries = finite(metrics.txRetries);
    if (retries != null && retries >= 500) {
      score += addReason(reasons, retries >= 1500 ? 'TX_RETRIES_CRITICAL' : 'TX_RETRIES_HIGH', 'Reintentos TX elevados', retries, 'reintentos', retries >= 1500 ? 15 : 8, retries >= 1500 ? 'critical' : 'deficient');
    }
    const lanSpeed = finite(metrics.lanSpeed);
    if (lanSpeed != null && lanSpeed < 100) {
      score += addReason(reasons, 'LAN_SPEED_LOW', 'Enlace LAN lento', lanSpeed, 'Mbps', 10, 'deficient');
    }

    const group = groupStats.get(input.groupKey || '__network__');
    const enoughPeers = !!group && Math.max(group.tx.length, group.rx.length) >= 3;
    const txRelative = relativeRateBand(finite(metrics.txRate), enoughPeers ? median(group?.tx || []) : null, 'TX', reasons);
    const rxRelative = relativeRateBand(finite(metrics.rxRate), enoughPeers ? median(group?.rx || []) : null, 'RX', reasons);
    score += txRelative.points + rxRelative.points;

    if (ccq != null && ccq <= 29) score = Math.max(score, 70);
    if (snr != null && snr < 10) score = Math.max(score, 70);
    if (signal != null && signal <= -75) score = Math.max(score, 70);
    if (signal != null && signal <= -61 && ccq != null && ccq < 50) score = Math.max(score, 80);
    if (ccq != null && ccq < 50 && snr != null && snr < 18) score = Math.max(score, 85);
    const seriousReasons = reasons.filter(reason => ['deficient', 'bad', 'critical'].includes(reason.level)).length;
    if (seriousReasons >= 3) score = Math.max(score, 80);
    else if (seriousReasons >= 2) score = Math.max(score, 60);
    if (reasons.some(reason => reason.level === 'critical')) score = Math.max(score, 80);
    score = Math.min(100, score);

    return {
      index,
      alias: `STA-${String(staOrdinal).padStart(2, '0')}`,
      role: input.role,
      score,
      level: levelForScore(score),
      candidate: score >= 40,
      derived: { snrDb: snr, txRateRatioPct: txRelative.ratio, rxRateRatioPct: rxRelative.ratio },
      reasons: reasons.sort((a, b) => b.points - a.points),
    };
  });

  const candidates = rows.filter(row => row.candidate).sort((a, b) => b.score - a.score || a.index - b.index);
  const selectedIndexes = candidates.slice(0, Math.max(0, maxSelected)).map(row => row.index);
  const staRows = rows.filter(row => row.role === 'sta');
  const count = (level: AirOsRiskLevel) => staRows.filter(row => row.level === level).length;

  return {
    rows,
    selectedIndexes,
    summary: {
      total: inputs.length,
      sta: staRows.length,
      apExcluded: inputs.filter(input => input.role === 'ap').length,
      unknownExcluded: inputs.filter(input => input.role === 'unknown').length,
      healthy: count('healthy'),
      observation: count('observation'),
      deficient: count('deficient'),
      bad: count('bad'),
      critical: count('critical'),
      candidates: candidates.length,
      selected: selectedIndexes.length,
    },
  };
}
