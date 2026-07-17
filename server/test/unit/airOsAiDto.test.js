const {
  pickMetrics, deviceFingerprint, buildDeviceDto, stableStringify, snapshotHash,
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
});
