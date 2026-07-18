const { normalizeNetworkAnalysis } = require('../../lib/ai/airOsAnalysisService');

describe('normalización del análisis AirOS de red', () => {
  it('elimina alias duplicados y fusiona varios hallazgos del mismo STA', () => {
    const analysis = {
      summary: 'Resumen', severity: 'warning', confidence: 'high', limitations: [],
      advisoryOnly: true, actionsExecuted: [],
      findings: [
        {
          title: 'Tasa deficiente en STA-01 · STA-01', deviceIds: ['STA-01'], evidence: ['txRate: 19'],
          interpretation: 'TX bajo.', possibleCauses: ['Interferencia'], manualChecks: ['Revisar espectro'],
        },
        {
          title: 'Señal en observación · STA-01', deviceIds: ['STA-01'], evidence: ['signal: -60'],
          interpretation: 'Señal fuera del objetivo.', possibleCauses: ['Desalineación'], manualChecks: ['Alinear antena'],
        },
      ],
    };

    const normalized = normalizeNetworkAnalysis(analysis, 'NETWORK');
    expect(normalized.findings).toHaveLength(1);
    expect(normalized.findings[0].deviceIds).toEqual(['STA-01']);
    expect(normalized.findings[0].title).not.toContain('STA-01');
    expect(normalized.findings[0].title).toContain('Tasa deficiente');
    expect(normalized.findings[0].title).toContain('Señal en observación');
    expect(normalized.findings[0].evidence).toEqual(['txRate: 19', 'signal: -60']);
  });
});
