const {
  pickMetrics, deviceFingerprint, buildDeviceDto, buildNetworkDto, stableStringify, snapshotHash,
} = require('../../lib/ai/airOsDto');

const device = {
  ip: '10.1.1.37', mac: 'F4:92:BF:EC:B6:57', name: 'Cliente real',
  model: 'LiteBeam M5', firmware: 'XW.v6.1.7', role: 'sta',
  sshUser: 'ubnt', sshPass: 'secret', wifiPassword: 'secret-wifi',
  cachedStats: {
    signal: -63, noiseFloor: -92, ccq: 99,
    _rawJson: '{"password":"secret"}', raw: 'secret', deviceName: 'Cliente real',
  },
};

describe('airOsDto', () => {
  it('usa allowlist y omite secretos, raw e identidad humana', () => {
    expect(pickMetrics(device.cachedStats)).toEqual({ signal: -63, noiseFloor: -92, ccq: 99 });
    const dto = buildDeviceDto({ workspaceId: 'ws-1', device, secret: 'hmac-test-key' });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('Cliente real');
    expect(serialized).not.toContain('10.1.1.37');
    expect(serialized).not.toContain('F4:92');
    expect(dto.derived.snrDb).toBe(29);
  });

  it('genera fingerprint estable y aislado por workspace', () => {
    const a = deviceFingerprint({ workspaceId: 'ws-a', device, secret: 'key' });
    const b = deviceFingerprint({ workspaceId: 'ws-a', device, secret: 'key' });
    const other = deviceFingerprint({ workspaceId: 'ws-b', device, secret: 'key' });
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  it('canoniza propiedades antes de calcular el hash', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(snapshotHash({ a: 1, b: 2 }, 'v1')).toBe(snapshotHash({ b: 2, a: 1 }, 'v1'));
  });

  it('construye un payload de red compacto sólo con STA candidatos', () => {
    const devices = [
      { ...device, role: 'ap', name: 'AP privado', ip: '10.1.1.1', cachedStats: { signal: -80, ccq: 5 } },
      { ...device, name: 'STA crítico', ip: '10.1.1.2', parentAp: 'AP privado', cachedStats: { signal: -61, noiseFloor: -90, ccq: 12, txRate: 20, rxRate: 15, cpuLoad: 99 } },
      { ...device, name: 'STA sano', ip: '10.1.1.3', parentAp: 'AP privado', cachedStats: { signal: -44, noiseFloor: -92, ccq: 98 } },
    ];
    const network = buildNetworkDto({ workspaceId: 'ws-1', devices, snapshotAt: 123, secret: 'key' });
    expect(network.dto.devices).toHaveLength(1);
    expect(network.dto.devices[0]).toMatchObject({ alias: 'STA-01', apAlias: 'AP-01', score: 80, level: 'critical' });
    expect(network.dto.devices[0].metrics).not.toHaveProperty('cpuLoad');
    expect(network.selection.summary).toMatchObject({ sta: 2, apExcluded: 1, selected: 1 });
    expect(network.selection.devices[0].index).toBe(1);
    expect(network.snapshotDevices[0].id).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(network.dto);
    expect(serialized).not.toContain('STA crítico');
    expect(serialized).not.toContain('AP privado');
    expect(serialized).not.toContain('10.1.1.');
  });
});
