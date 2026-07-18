const crypto = require('node:crypto');
const { assessAirOsNetwork } = require('@gestionvpn/contracts');
const { evaluateAirOsMetrics } = require('./airOsRules');

const METRIC_KEYS = Object.freeze([
  'signal', 'noiseFloor', 'ccq', 'txRate', 'rxRate', 'cpuLoad', 'memoryPercent',
  'airmaxQuality', 'airmaxCapacity', 'uptimeStr', 'firmwareVersion', 'mode',
  'networkMode', 'frequency', 'channelNumber', 'channelWidth', 'txPower',
  'distance', 'chains', 'rssi', 'txRetries', 'missedBeacons', 'rxCrypts',
  'chainRssi', 'opmode', 'countryCode', 'temperature', 'loadAvg', 'lanSpeed',
  'lanInfo', 'cinr', 'airtime', 'txAirtime', 'rxAirtime', 'txLatency',
]);

const NETWORK_METRIC_KEYS = Object.freeze([
  'signal', 'noiseFloor', 'ccq', 'txRate', 'rxRate', 'airmaxQuality',
  'airmaxCapacity', 'txRetries', 'txLatency', 'lanSpeed',
]);

function pickMetrics(stats = {}) {
  const output = {};
  for (const key of METRIC_KEYS) {
    const value = stats[key];
    if (value !== undefined && value !== null && value !== '') output[key] = value;
  }
  return output;
}

function pickNetworkMetrics(stats = {}, derived = {}) {
  const output = {};
  for (const key of NETWORK_METRIC_KEYS) {
    const value = stats[key];
    if (value !== undefined && value !== null && value !== '') output[key] = value;
  }
  if (derived.snrDb != null) output.snr = derived.snrDb;
  return output;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function snapshotHash(dto, promptVersion) {
  return crypto.createHash('sha256').update(`${promptVersion}|${stableStringify(dto)}`).digest('hex');
}

function deviceFingerprint({ workspaceId, device, secret = process.env.AI_PSEUDONYM_KEY }) {
  if (!secret) throw Object.assign(new Error('AI_PSEUDONYM_KEY no configurada'), { code: 'AI_NOT_CONFIGURED' });
  const mac = String(device.mac || '').replace(/[^a-f0-9]/gi, '').toUpperCase();
  const fallback = `${device.ip || ''}|${device.model || ''}|${device.name || ''}`;
  return crypto.createHmac('sha256', secret).update(`${workspaceId}|${mac || fallback}`).digest('hex');
}

function buildDeviceDto({ workspaceId, device, alias = 'Equipo 01', secret }) {
  const metrics = pickMetrics(device.cachedStats);
  const rules = evaluateAirOsMetrics(metrics);
  return {
    id: deviceFingerprint({ workspaceId, device, secret }),
    alias,
    role: device.role,
    model: device.model || metrics.deviceModel || 'Desconocido',
    firmware: metrics.firmwareVersion || device.firmware || null,
    metrics,
    derived: rules.derived,
    riskScore: rules.riskScore,
    ruleFindings: rules.ruleFindings,
  };
}

function average(values) {
  const finiteValues = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  if (!finiteValues.length) return null;
  return Math.round((finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length) * 10) / 10;
}

function buildNetworkDto({ workspaceId, devices, snapshotAt, selectedDeviceIndexes, secret }) {
  const scoringInputs = devices.map(device => ({
    role: device.role,
    groupKey: device.parentAp || device.essid || null,
    metrics: pickNetworkMetrics(device.cachedStats),
  }));
  const assessment = assessAirOsNetwork(scoringInputs, 10);
  const candidateIndexes = new Set(assessment.rows.filter(row => row.candidate).map(row => row.index));
  const requested = Array.isArray(selectedDeviceIndexes) ? [...new Set(selectedDeviceIndexes)] : assessment.selectedIndexes;
  const selectedSet = new Set(requested.filter(index => candidateIndexes.has(index)).slice(0, 10));
  const selectedRows = assessment.rows
    .filter(row => selectedSet.has(row.index))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const apAliases = new Map();
  const apAliasFor = device => {
    const key = device.parentAp || device.essid || '__unknown_ap__';
    if (!apAliases.has(key)) apAliases.set(key, `AP-${String(apAliases.size + 1).padStart(2, '0')}`);
    return apAliases.get(key);
  };

  const compactDevices = selectedRows.map(row => {
    const device = devices[row.index];
    return {
      alias: row.alias,
      apAlias: apAliasFor(device),
      family: String(device.model || '').toLowerCase().includes('ac') ? 'AC' : 'M5',
      score: row.score,
      level: row.level,
      metrics: pickNetworkMetrics(device.cachedStats, row.derived),
      flags: row.reasons.map(reason => reason.code),
    };
  });

  const staRows = assessment.rows.filter(row => row.role === 'sta');
  const dto = {
    kind: 'network_sta_candidates',
    snapshotAt,
    summary: {
      ...assessment.summary,
      selected: compactDevices.length,
      averageSignal: average(staRows.map(row => devices[row.index]?.cachedStats?.signal)),
      averageCcq: average(staRows.map(row => devices[row.index]?.cachedStats?.ccq)),
      averageSnr: average(staRows.map(row => row.derived.snrDb)),
    },
    devices: compactDevices,
  };

  const snapshotDevices = selectedRows.map(row => {
    const snapshot = buildDeviceDto({
      workspaceId,
      device: devices[row.index],
      alias: row.alias,
      secret,
    });
    return {
      ...snapshot,
      riskScore: row.score,
      derived: { ...snapshot.derived, ...row.derived },
      ruleFindings: row.reasons,
    };
  });

  return {
    dto,
    snapshotDevices,
    selection: {
      summary: { ...assessment.summary, selected: selectedRows.length },
      devices: selectedRows.map(row => ({
        index: row.index,
        alias: row.alias,
        score: row.score,
        level: row.level,
        derived: row.derived,
        reasons: row.reasons,
      })),
    },
  };
}

module.exports = {
  METRIC_KEYS,
  NETWORK_METRIC_KEYS,
  pickMetrics,
  pickNetworkMetrics,
  stableStringify,
  snapshotHash,
  deviceFingerprint,
  buildDeviceDto,
  buildNetworkDto,
};
