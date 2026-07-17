const { evaluateAirOsMetrics } = require('../../lib/ai/airOsRules');

describe('airOsRules', () => {
  it('calcula SNR y mantiene un equipo saludable con riesgo cero', () => {
    const result = evaluateAirOsMetrics({ signal: -55, noiseFloor: -92, ccq: 98, airmaxCapacity: 92 });
    expect(result.derived.snrDb).toBe(37);
    expect(result.riskScore).toBe(0);
    expect(result.ruleFindings).toEqual([]);
  });

  it('explica de forma reproducible múltiples riesgos', () => {
    const result = evaluateAirOsMetrics({
      signal: -84, noiseFloor: -91, ccq: 45, airmaxCapacity: 35,
      txRetries: 2000, cpuLoad: 90, chainRssi: [-55, -74],
    });
    expect(result.derived.snrDb).toBe(7);
    expect(result.derived.chainImbalanceDb).toBe(19);
    expect(result.riskScore).toBeGreaterThanOrEqual(80);
    expect(result.ruleFindings.map(f => f.code)).toEqual(expect.arrayContaining([
      'WEAK_SIGNAL', 'LOW_SNR', 'LOW_CCQ', 'LOW_AIRMAX_CAPACITY',
      'HIGH_TX_RETRIES', 'HIGH_CPU', 'CHAIN_IMBALANCE',
    ]));
  });
});
