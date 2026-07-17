import { describe, expect, it } from 'vitest';
import { toAirOsAiDevice, toAirOsAiIdentity } from './airOsAiApi';
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

    expect(toAirOsAiIdentity(device)).toEqual({
      ip: '10.1.1.37',
      mac: 'F4:92:BF:EC:B6:57',
      name: 'Cliente privado',
      model: 'LiteBeam M5',
    });
  });
});
