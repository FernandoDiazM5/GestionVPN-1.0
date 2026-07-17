function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function addFinding(findings, points, code, severity, evidence) {
  findings.push({ code, points, severity, evidence });
  return points;
}

function evaluateAirOsMetrics(metrics = {}) {
  const findings = [];
  let riskScore = 0;
  const signal = finite(metrics.signal);
  const noise = finite(metrics.noiseFloor);
  const snr = signal != null && noise != null ? signal - noise : null;

  if (signal != null && signal < -75) {
    riskScore += addFinding(findings, signal < -82 ? 20 : 12, 'WEAK_SIGNAL', signal < -82 ? 'critical' : 'warning', { signalDbm: signal });
  }
  if (snr != null && snr < 20) {
    riskScore += addFinding(findings, snr < 12 ? 20 : 12, 'LOW_SNR', snr < 12 ? 'critical' : 'warning', { snrDb: snr });
  }
  if (finite(metrics.ccq) != null && metrics.ccq < 80) {
    riskScore += addFinding(findings, metrics.ccq < 60 ? 18 : 10, 'LOW_CCQ', metrics.ccq < 60 ? 'critical' : 'warning', { ccqPct: metrics.ccq });
  }
  if (finite(metrics.airmaxCapacity) != null && metrics.airmaxCapacity < 70) {
    riskScore += addFinding(findings, metrics.airmaxCapacity < 45 ? 16 : 8, 'LOW_AIRMAX_CAPACITY', metrics.airmaxCapacity < 45 ? 'critical' : 'warning', { airmaxCapacityPct: metrics.airmaxCapacity });
  }
  if (finite(metrics.txRetries) != null && metrics.txRetries >= 500) {
    riskScore += addFinding(findings, metrics.txRetries >= 1500 ? 15 : 8, 'HIGH_TX_RETRIES', metrics.txRetries >= 1500 ? 'critical' : 'warning', { txRetries: metrics.txRetries });
  }
  if (finite(metrics.cpuLoad) != null && metrics.cpuLoad >= 80) {
    riskScore += addFinding(findings, 8, 'HIGH_CPU', 'warning', { cpuPct: metrics.cpuLoad });
  }
  if (finite(metrics.memoryPercent) != null && metrics.memoryPercent >= 85) {
    riskScore += addFinding(findings, 8, 'HIGH_MEMORY', 'warning', { memoryPct: metrics.memoryPercent });
  }
  if (finite(metrics.temperature) != null && metrics.temperature >= 75) {
    riskScore += addFinding(findings, metrics.temperature >= 85 ? 14 : 7, 'HIGH_TEMPERATURE', metrics.temperature >= 85 ? 'critical' : 'warning', { temperatureC: metrics.temperature });
  }
  if (finite(metrics.lanSpeed) != null && metrics.lanSpeed < 100) {
    riskScore += addFinding(findings, 10, 'LOW_LAN_SPEED', 'warning', { lanSpeedMbps: metrics.lanSpeed });
  }

  const chains = Array.isArray(metrics.chainRssi) ? metrics.chainRssi.filter(v => Number.isFinite(v)) : [];
  const chainImbalance = chains.length >= 2 ? Math.max(...chains) - Math.min(...chains) : null;
  if (chainImbalance != null && chainImbalance >= 8) {
    riskScore += addFinding(findings, chainImbalance >= 15 ? 14 : 8, 'CHAIN_IMBALANCE', chainImbalance >= 15 ? 'critical' : 'warning', { chainImbalanceDb: chainImbalance });
  }

  return {
    derived: { snrDb: snr, chainImbalanceDb: chainImbalance },
    riskScore: Math.min(100, riskScore),
    ruleFindings: findings,
  };
}

module.exports = { evaluateAirOsMetrics };
