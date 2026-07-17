const crypto = require('node:crypto');
const { evaluateAirOsMetrics } = require('./airOsRules');

const METRIC_KEYS = Object.freeze([
  'signal', 'noiseFloor', 'ccq', 'txRate', 'rxRate', 'cpuLoad', 'memoryPercent',
  'airmaxQuality', 'airmaxCapacity', 'uptimeStr', 'firmwareVersion', 'mode',
  'networkMode', 'frequency', 'channelNumber', 'channelWidth', 'txPower',
  'distance', 'chains', 'rssi', 'txRetries', 'missedBeacons', 'rxCrypts',
  'chainRssi', 'opmode', 'countryCode', 'temperature', 'loadAvg', 'lanSpeed',
  'lanInfo', 'cinr', 'airtime', 'txAirtime', 'rxAirtime', 'txLatency',
]);

function pickMetrics(stats = {}) {
  const output = {};
  for (const key of METRIC_KEYS) {
    const value = stats[key];
    if (value !== undefined && value !== null && value !== '') output[key] = value;
  }
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

function buildNetworkDto({ workspaceId, devices, snapshotAt, secret }) {
  const normalized = devices.map((device, index) => buildDeviceDto({
    workspaceId,
    device,
    alias: `Equipo ${String(index + 1).padStart(2, '0')}`,
    secret,
  }));
  const counts = normalized.reduce((acc, device) => {
    acc.total++;
    acc[device.role] = (acc[device.role] || 0) + 1;
    if (device.riskScore >= 40) acc.criticalOrHigh++;
    return acc;
  }, { total: 0, ap: 0, sta: 0, unknown: 0, criticalOrHigh: 0 });
  return { snapshotAt, counts, devices: normalized };
}

module.exports = {
  METRIC_KEYS,
  pickMetrics,
  stableStringify,
  snapshotHash,
  deviceFingerprint,
  buildDeviceDto,
  buildNetworkDto,
};
