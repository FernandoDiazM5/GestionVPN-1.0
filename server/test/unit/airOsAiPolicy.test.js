const { validateAnalysisPolicy } = require('../../lib/ai/airOsPolicy');

const base = {
  summary: 'Enlace estable', severity: 'info', confidence: 'high', limitations: [],
  advisoryOnly: true, actionsExecuted: [],
};
const dto = { alias: 'Equipo 01', metrics: { signal: -63, noiseFloor: -92 }, derived: { snrDb: 29 } };

describe('política de salida Gemini AirOS', () => {
  it('acepta hallazgos sustentados por métricas del DTO', () => {
    const analysis = {
      ...base,
      findings: [{
        title: 'Señal adecuada', evidence: ['signal: -63 dBm', 'snrDb: 29 dB'],
        interpretation: 'El margen es adecuado.', possibleCauses: [], manualChecks: ['Verificar estabilidad visualmente.'],
      }],
    };
    expect(validateAnalysisPolicy(analysis, dto)).toBe(analysis);
  });

  it.each([
    'Ejecuta el comando ssh ubnt@10.1.1.1',
    'Consulta https://ejemplo.test',
    'Usa mca-cli-set para guardar',
  ])('rechaza instrucciones, comandos o enlaces: %s', text => {
    const analysis = { ...base, findings: [], limitations: [text] };
    expect(() => validateAnalysisPolicy(analysis, dto)).toThrow();
  });

  it('rechaza evidencia que no existe en el snapshot', () => {
    const analysis = {
      ...base,
      findings: [{
        title: 'Dato inventado', evidence: ['temperatura: 95 C'], interpretation: 'Crítico',
        possibleCauses: [], manualChecks: [],
      }],
    };
    expect(() => validateAnalysisPolicy(analysis, dto)).toThrow(/evidencia no sustentada/i);
  });
});
