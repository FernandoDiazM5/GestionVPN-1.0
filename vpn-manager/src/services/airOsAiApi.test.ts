import { describe, expect, it } from 'vitest';
import {
  buildAirOsNetworkPreview,
  toAirOsAiDevice,
  toAirOsAiIdentity,
  toAirOsAiNetworkDevice,
} from './airOsAiApi';
import type { ScannedDevice } from '../types/devices';

describe('toAirOsAiDevice', () => {
  it('copia sólo la allowlist y no arrastra secretos ni bloques raw', () => {
    const device: ScannedDevice = {
      ip: '10.1.1.37',
      mac: 'F4:92:BF:EC:B6:57',
      name: 'Cliente privado',
      model: 'LiteBeam M5',
      firmware: 'XW.v6.1.7',
      role: 'sta',
      sshUser: 'ubnt',
      sshPass: 'secreto',
      cachedStats: {
        signal: -63,
        noiseFloor: -92,
        ccq: 99,
        deviceName: 'Cliente privado',
        deviceModel: 'LiteBeam M5',
        wlanMac: 'F4:92:BF:EC:B6:57',
        raw: 'password=secreto',
        _rawJson: '{"sensitive":true}',
        stations: [{ mac: 'AA:BB:CC:DD:EE:FF', lastIp: '10.1.1.99' }],
      },
    };

    const output = toAirOsAiDevice(device);
    expect(output.cachedStats).toEqual({ signal: -63, noiseFloor: -92, ccq: 99 });
    expect(JSON.stringify(output.cachedStats)).not.toContain('secreto');
    expect(JSON.stringify(output.cachedStats)).not.toContain('10.1.1.99');
    expect(output.role).toBe('sta');

    expect(toAirOsAiNetworkDevice({
      ...device,
      cachedStats: { ...device.cachedStats, cpuLoad: 67, txLatency: 18 },
    }).cachedStats).toEqual({ signal: -63, noiseFloor: -92, ccq: 99, txLatency: 18 });

    expect(toAirOsAiIdentity(device)).toEqual({
      ip: '10.1.1.37',
      mac: 'F4:92:BF:EC:B6:57',
      name: 'Cliente privado',
      model: 'LiteBeam M5',
    });
  });

  it('preselecciona localmente sólo STA con riesgo y excluye AP', () => {
    const devices: ScannedDevice[] = [
      {
        ip: '10.1.1.1', mac: 'AA:AA:AA:AA:AA:AA', name: 'AP', model: 'Rocket M5', firmware: '', role: 'ap',
        cachedStats: { signal: -80, ccq: 1 },
      },
      {
        ip: '10.1.1.2', mac: 'BB:BB:BB:BB:BB:BB', name: 'STA crítico', model: 'LiteBeam M5', firmware: '', role: 'sta', parentAp: 'AP',
        cachedStats: { signal: -61, noiseFloor: -90, ccq: 12 },
      },
      {
        ip: '10.1.1.3', mac: 'CC:CC:CC:CC:CC:CC', name: 'STA sano', model: 'LiteBeam M5', firmware: '', role: 'sta', parentAp: 'AP',
        cachedStats: { signal: -44, noiseFloor: -92, ccq: 98 },
      },
    ];
    const preview = buildAirOsNetworkPreview(devices);
    expect(preview.summary).toMatchObject({ sta: 2, apExcluded: 1, candidates: 1, selected: 1 });
    expect(preview.selectedIndexes).toEqual([1]);
    expect(preview.rows[1]).toMatchObject({ alias: 'STA-01', level: 'critical', score: 80 });
  });
});
