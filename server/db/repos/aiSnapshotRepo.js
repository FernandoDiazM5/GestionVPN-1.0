const { query } = require('../mysql');

async function insertMany({ workspaceId, analysisRunId, devices, capturedAt, retentionDays }, runQuery = query) {
  const expiresAt = capturedAt + retentionDays * 86400000;
  for (const device of devices) {
    const m = device.metrics || {};
    await runQuery(
      `INSERT INTO ai_air_os_snapshots
        (workspace_id, analysis_run_id, device_fingerprint, role, model, firmware,
         signal_dbm, noise_dbm, snr_db, ccq_pct, airmax_quality_pct, airmax_capacity_pct,
         tx_rate_mbps, rx_rate_mbps, cpu_pct, memory_pct, temperature_c, risk_score,
         extra_metrics_json, captured_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [workspaceId, analysisRunId, device.id, device.role, device.model || '', device.firmware,
       m.signal ?? null, m.noiseFloor ?? null, device.derived?.snrDb ?? null, m.ccq ?? null,
       m.airmaxQuality ?? null, m.airmaxCapacity ?? null, m.txRate ?? null, m.rxRate ?? null,
       m.cpuLoad ?? null, m.memoryPercent ?? null, m.temperature ?? null, device.riskScore || 0,
       JSON.stringify(m), capturedAt, expiresAt]
    );
  }
}

async function purgeExpired(now = Date.now(), runQuery = query) {
  const result = await runQuery('DELETE FROM ai_air_os_snapshots WHERE expires_at < ?', [now]);
  return Number(result.affectedRows || 0);
}

module.exports = { insertMany, purgeExpired };
