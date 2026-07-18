import { describe, expect, it } from 'vitest';
import type { AirOsNetworkReportData } from './airOsAiReport';
import { createAirOsNetworkAnalysisPdf } from './exportAirOsAiPdf';

const report: AirOsNetworkReportData = {
  snapshotAt: Date.UTC(2026, 6, 17, 20, 0),
  subnet: '10.1.1.0/24',
  summary: {
    total: 3, sta: 2, apExcluded: 1, unknownExcluded: 0,
    healthy: 1, observation: 0, deficient: 0, bad: 0, critical: 1,
    candidates: 1, selected: 1,
  },
  devices: [{
    index: 1, alias: 'STA-01', name: 'Cliente San Martín', ip: '10.1.1.2',
    model: 'LiteBeam M5', apName: 'AP Floresta', score: 80, level: 'critical',
    signal: -61, noiseFloor: -90, snr: 29, ccq: 12, txRate: 20, rxRate: 15,
    txLatency: null, channelWidth: 20,
    reasons: [{ code: 'CCQ_CRITICAL', label: 'CCQ crítico', value: 12, unit: '%', points: 35, level: 'critical' }],
  }],
  analysis: {
    summary: 'Se detectó un receptor con calidad crítica.', severity: 'critical', confidence: 'high',
    findings: [{
      title: 'CCQ crítico', deviceIds: ['STA-01'], evidence: ['ccq: 12'],
      interpretation: 'La calidad del enlace es extremadamente baja.',
      possibleCauses: ['Interferencia'], manualChecks: ['Revisar alineación'],
    }],
    limitations: ['Análisis basado en un único snapshot.'], advisoryOnly: true, actionsExecuted: [],
  },
};

describe('PDF de diagnóstico AirOS', () => {
  it('genera un PDF no vacío con el reporte identificado', async () => {
    const blob = await createAirOsNetworkAnalysisPdf(report);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(5_000);
  });
});
