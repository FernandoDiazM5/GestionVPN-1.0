import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AirOsAiAnalysisResult, AirOsAiStatus } from '@gestionvpn/contracts';
import type { ScannedDevice } from '../../../../types/devices';
import { buildAirOsNetworkPreview } from '../../../../services/airOsAiApi';
import type { AirOsAiController, AirOsNetworkReportContext } from '../hooks/useAirOsAi';
import { AirOsAiDialog } from './AirOsAiDialog';
import { AirOsNetworkResult } from './AirOsNetworkResult';

const ap: ScannedDevice = {
  ip: '10.1.1.1', mac: 'AA:AA:AA:AA:AA:AA', name: 'AP Floresta', model: 'Rocket M5', firmware: '', role: 'ap',
  cachedStats: { signal: -80, ccq: 1 },
};
const critical: ScannedDevice = {
  ip: '10.1.1.2', mac: 'BB:BB:BB:BB:BB:BB', name: 'Cliente San Martín', model: 'LiteBeam M5', firmware: '', role: 'sta', parentAp: 'AP Floresta',
  cachedStats: { deviceName: 'Cliente San Martín', signal: -61, noiseFloor: -90, ccq: 12, txRate: 20, rxRate: 15 },
};
const devices = [ap, critical];
const preview = buildAirOsNetworkPreview(devices);
const status: AirOsAiStatus = {
  configured: true, enabled: true, model: 'gemini-test', moderatorAccessEnabled: true,
  consentAccepted: true, policyVersion: 'air-os-ai-v1', cooldownSeconds: 60,
  limits: { dailyRequests: 20, workspaceDailyRequests: 10, dailyTokens: 150000, maxDevicesPerNetwork: 100, maxInputBytes: 60000 },
  usage: { requestCount: 1, totalTokens: 100 },
};

describe('análisis de red AirOS optimizado', () => {
  it('muestra la prelista identificable y permite desmarcar candidatos', async () => {
    const toggleNetworkDevice = vi.fn();
    const controller = {
      available: true,
      status,
      pending: { kind: 'NETWORK', devices, scope: { visibleCount: 2 }, preview, selectedIndexes: [1] },
      result: null,
      networkReport: null,
      busy: false,
      error: null,
      requestDevice: vi.fn(), requestNetwork: vi.fn(), toggleNetworkDevice, submit: vi.fn(), close: vi.fn(),
    } as unknown as AirOsAiController;

    render(<AirOsAiDialog controller={controller} />);
    expect(screen.getByText('Cliente San Martín')).toBeInTheDocument();
    expect(screen.getByText(/10\.1\.1\.2/)).toBeInTheDocument();
    expect(screen.getAllByText('1 / 10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1')).not.toHaveLength(0);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(toggleNetworkDevice).toHaveBeenCalledWith(1);
  });

  it('reincorpora nombre, IP y AP localmente en el resultado', () => {
    const selection = {
      summary: { ...preview.summary, selected: 1 },
      devices: [{
        index: 1, alias: 'STA-01', score: 80, level: 'critical' as const, mandatory: true,
        derived: preview.rows[1].derived, reasons: preview.rows[1].reasons,
      }],
    };
    const result: AirOsAiAnalysisResult = {
      uuid: 'run-1', cached: false, model: 'gemini-test', createdAt: 1,
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      analysis: {
        summary: 'Se detectó un receptor crítico.', severity: 'critical', confidence: 'high',
        findings: [{
          title: 'CCQ crítico', deviceIds: ['STA-01'], evidence: ['ccq: 12'],
          interpretation: 'El enlace presenta calidad muy baja.', possibleCauses: ['Interferencia'],
          manualChecks: ['Revisar alineación'],
        }],
        limitations: [], advisoryOnly: true, actionsExecuted: [],
      },
      networkSelection: selection,
    };
    const context: AirOsNetworkReportContext = { devices, selection, snapshotAt: Date.now(), scope: { visibleCount: 2 } };
    render(<AirOsNetworkResult result={result} context={context} />);
    expect(screen.getAllByText('Cliente San Martín').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10\.1\.1\.2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/AP Floresta/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeInTheDocument();
  });
});
