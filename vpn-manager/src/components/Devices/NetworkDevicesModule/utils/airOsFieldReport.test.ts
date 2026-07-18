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
  it('crea un único título y separa revisiones remotas de campo', () => {
    const [deviceReport] = buildAirOsDeviceFieldReports(report);
    expect(deviceReport.title).toBe('Tasas TX/RX deficientes, señal en observación y CCQ aceptable');
    expect(deviceReport.problems.map(problem => problem.parameter)).toEqual(['Tasa TX', 'Tasa RX', 'Señal', 'CCQ']);
    expect(deviceReport.remoteChecks).toContain('Realizar un escaneo de espectro para revisar frecuencia, ruido y ocupación del canal');
    expect(deviceReport.remoteChecks).toContain('Validar los reintentos TX y monitorear la estabilidad del CCQ');
    expect(deviceReport.fieldChecks).toContain('Verificar la alineación física fina, polarización y cadenas en ambos extremos');
    expect(deviceReport.fieldChecks).toContain('Confirmar la línea de vista y el despeje de la zona de Fresnel');
    expect(deviceReport.title).not.toContain('STA-01');
  });

  it('formatea WhatsApp con resumen, métricas y planes de acción separados', () => {
    const text = formatAirOsNetworkWhatsApp(report);
    expect(text).toContain('*1. ANÁLISIS POR CLIENTE*');
    expect(text).toContain('*WILDER HERBER*');
    expect(text).toContain('*📋 RESUMEN DEL ESTADO*');
    expect(text).toContain('*📊 MÉTRICAS CLAVE*');
    expect(text).toContain('*🖥️ PLAN DE ACCIÓN: REVISIONES REMOTAS*');
    expect(text).toContain('*🛠️ PLAN DE ACCIÓN: REVISIONES EN CAMPO*');
    expect(text).not.toContain('STA-01 · STA-01');
  });
});
