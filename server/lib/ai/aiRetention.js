const MAX_HISTORY_RETENTION_DAYS = 7;

function boundedDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return MAX_HISTORY_RETENTION_DAYS;
  return Math.min(MAX_HISTORY_RETENTION_DAYS, Math.floor(parsed));
}

function analysisRetentionDays() {
  return boundedDays(process.env.GEMINI_ANALYSIS_RETENTION_DAYS);
}

function snapshotRetentionDays() {
  return boundedDays(process.env.GEMINI_SNAPSHOT_RETENTION_DAYS);
}

function historyCutoff(now = Date.now()) {
  return now - analysisRetentionDays() * 86400000;
}

module.exports = {
  MAX_HISTORY_RETENTION_DAYS,
  boundedDays,
  analysisRetentionDays,
  snapshotRetentionDays,
  historyCutoff,
};
