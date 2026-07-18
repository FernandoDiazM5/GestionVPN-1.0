import { describe, expect, it } from 'vitest';
import type { AirOsNetworkReportData } from './airOsAiReport';
import { buildAirOsDeviceFieldReports } from './airOsFieldReport';
import { formatAirOsNetworkWhatsApp } from './formatAirOsWhatsApp';

const report: AirOsNetworkReportData = {
  snapshotAt: Date.UTC(2026, 6, 17, 20, 0),
  summary: {
    total: 1, sta: 1, apExcluded: 0, unknownExcluded: 0,
    healthy: 0, observation: 0, deficient: 0, bad: 1, critical: 0,
    candidates: 1, selected: 1,
  },
  devices: [{
    index: 0, alias: 'STA-01', name: 'WILDER HERBER', ip: '142.152.7.69',
    model: 'LiteBeam M5', apName: 'GAEL NETTV_HUARANGO', score: 60, level: 'bad',
    signal: -60, noiseFloor: -92, snr: 32, ccq: 82, txRate: 19, rxRate: 39,
    txLatency: null, channelWidth: 20,
    reasons: [
      { code: 'TX_RATE_BAD', label: 'TX bajo', value: 19, unit: 'Mbps', points: 20, level: 'bad' },
      { code: 'RX_RATE_BAD', label: 'RX bajo', value: 39, unit: 'Mbps', points: 20, level: 'bad' },
      { code: 'SIGNAL_OBSERVATION', label: 'Señal en observación', value: -60, unit: 'dBm', points: 5, level: 'observation' },
      { code: 'CCQ_ACCEPTABLE', label: 'CCQ aceptable', value: 82, unit: '%', points: 5, level: 'observation' },
    ],
  }],
  analysis: {
    summary: 'Se detectó degradación.', severity: 'warning', confidence: 'high',
    findings: [{
      title: 'Rendimiento deficiente', deviceIds: ['STA-01'], evidence: ['txRate: 19'],
      interpretation: 'La modulación está degradada para las condiciones observadas.',
      possibleCauses: ['Interferencia'], manualChecks: ['Revisar el espectro'],
    }],
    limitations: [], advisoryOnly: true, actionsExecuted: [],
  },
};

describe('informe de campo AirOS', () => {
  it('crea un único título con todos los problemas y una guía por parámetro', () => {
    const [deviceReport] = buildAirOsDeviceFieldReports(report);
    expect(deviceReport.title).toBe('Tasas TX/RX deficientes, señal en observación y CCQ aceptable');
    expect(deviceReport.problems.map(problem => problem.parameter)).toEqual(['Tasa TX', 'Tasa RX', 'Señal', 'CCQ']);
    expect(deviceReport.problems.every(problem => problem.diagnosis && problem.fieldChecks.length >= 2)).toBe(true);
    expect(deviceReport.title).not.toContain('STA-01');
  });

  it('formatea WhatsApp por equipo, parámetro, diagnóstico y acción de campo', () => {
    const text = formatAirOsNetworkWhatsApp(report);
    expect(text).toContain('*1. WILDER HERBER*');
    expect(text).toContain('⚠️ *Problemas:* Tasas TX/RX deficientes, señal en observación y CCQ aceptable');
    expect(text).toContain('*🔎 Señal: Observación (-60 dBm)*');
    expect(text).toContain('🩺 *Diagnóstico:*');
    expect(text).toContain('🔧 *Acciones de campo:*');
    expect(text).not.toContain('STA-01 · STA-01');
  });
});
