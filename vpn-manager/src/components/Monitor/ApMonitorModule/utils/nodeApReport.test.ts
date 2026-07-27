import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import { createNodeApReportPdf, nodeApReportFileName } from './exportNodeApReportPdf';
import { buildNodeApReport } from './nodeApReport';

const generatedAt = Date.UTC(2026, 6, 27, 15, 0);
const devices: SavedDevice[] = [{
  id: 'ap-1',
  mac: 'AA:BB:CC:DD:EE:01',
  ip: '192.168.30.2',
  name: 'AP Torre Norte',
  model: 'Rocket M5',
  firmware: 'XM.v6.1.7',
  role: 'ap',
  nodeId: 'node-1',
  nodeName: 'TORRE ÑORTE',
  sshUser: 'ubnt',
  hasSshPass: true,
  addedAt: generatedAt - 100_000,
  essid: 'SECTOR-1',
  frequency: 5805,
  channelWidth: 20,
  cachedStats: { txPower: 24, cpuLoad: 19, memoryPercent: 42 },
}, {
  id: 'ap-2',
  mac: 'AA:BB:CC:DD:EE:02',
  ip: '192.168.30.3',
  name: 'AP Sin Datos',
  model: 'PowerBeam M5',
  firmware: 'XM.v6.1.7',
  role: 'ap',
  nodeId: 'node-1',
  nodeName: 'TORRE ÑORTE',
  addedAt: generatedAt - 100_000,
}];

const polls: Record<string, PollResult> = {
  'ap-1': {
    polledAt: generatedAt - 30_000,
    loading: false,
    stations: [{
      mac: '11:22:33:44:55:66',
      remote_hostname: 'Cliente Uno',
      cpe_product: 'LiteBeam M5',
      lastip: '192.168.30.20',
      signal: -80,
      remote_signal: -75,
      noisefloor: -95,
      ccq: 55,
      tx_rate: 65,
      rx_rate: 52,
      airmax_quality: 70,
      airmax_capacity: 60,
      distance: 1500,
      uptimeStr: '2d 03:00:00',
    }],
  },
};

describe('informe por nodo de Monitor AP', () => {
  it('construye un snapshot sanitizado y resume AP/CPE degradados', () => {
    const report = buildNodeApReport({
      nodeId: 'node-1',
      nodeName: 'TORRE ÑORTE',
      aps: devices,
      stas: [],
    }, polls, generatedAt);

    expect(report.summary).toMatchObject({
      apTotal: 2,
      apFresh: 1,
      apNoData: 1,
      apWithoutSsh: 1,
      cpeTotal: 1,
      cpeDegraded: 1,
      cpeCritical: 1,
    });
    expect(report.aps[0].cpes[0]).toMatchObject({
      name: 'Cliente Uno',
      snr: 15,
      health: 'critical',
    });
    expect(JSON.stringify(report)).not.toContain('sshPass');
  });

  it('genera un PDF real y un nombre de archivo seguro', async () => {
    const report = buildNodeApReport({
      nodeId: 'node-1',
      nodeName: 'TORRE ÑORTE',
      aps: devices,
      stas: [],
    }, polls, generatedAt);
    const blob = await createNodeApReportPdf(report);
    const visualOutput = process.env.AP_REPORT_PDF_OUTPUT;
    if (visualOutput) {
      await mkdir(dirname(visualOutput), { recursive: true });
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });
      await writeFile(visualOutput, Buffer.from(bytes));
    }

    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(5_000);
    expect(nodeApReportFileName(report)).toBe('monitor_ap_TORRE_NORTE_2026-07-27.pdf');
  });
});
