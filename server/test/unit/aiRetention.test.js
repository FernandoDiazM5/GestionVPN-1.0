const retention = require('../../lib/ai/aiRetention');

const originalAnalysis = process.env.GEMINI_ANALYSIS_RETENTION_DAYS;
const originalSnapshots = process.env.GEMINI_SNAPSHOT_RETENTION_DAYS;

afterEach(() => {
  if (originalAnalysis === undefined) delete process.env.GEMINI_ANALYSIS_RETENTION_DAYS;
  else process.env.GEMINI_ANALYSIS_RETENTION_DAYS = originalAnalysis;
  if (originalSnapshots === undefined) delete process.env.GEMINI_SNAPSHOT_RETENTION_DAYS;
  else process.env.GEMINI_SNAPSHOT_RETENTION_DAYS = originalSnapshots;
});

describe('retención Gemini AirOS', () => {
  it('limita análisis y snapshots a un máximo de siete días', () => {
    process.env.GEMINI_ANALYSIS_RETENTION_DAYS = '30';
    process.env.GEMINI_SNAPSHOT_RETENTION_DAYS = '90';
    expect(retention.analysisRetentionDays()).toBe(7);
    expect(retention.snapshotRetentionDays()).toBe(7);
  });

  it('permite una retención más corta y calcula el corte', () => {
    process.env.GEMINI_ANALYSIS_RETENTION_DAYS = '3';
    expect(retention.analysisRetentionDays()).toBe(3);
    expect(retention.historyCutoff(10 * 86400000)).toBe(7 * 86400000);
  });
});
