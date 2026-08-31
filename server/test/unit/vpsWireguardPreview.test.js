const { previewVpsWireguard } = require('../../lib/vpsWireguardPreview');

const valid = {
  interface: 'wg0', address: '10.12.250.60/32', localListenPort: 0, mtu: 1420,
  corePublicKey: 'A'.repeat(43) + '=', coreEndpointHost: '213.173.36.232', coreEndpointPort: 13232,
  allowedIps: ['10.12.248.0/22'], persistentKeepalive: 25,
};

describe('vpsWireguardPreview', () => {
  it('acepta el contrato de gestión sin habilitar aplicación', () => {
    const result = previewVpsWireguard(valid, { managementSupernet: '10.12.248.0/22', interfaces: {} });
    expect(result.valid).toBe(true);
    expect(result.canApply).toBe(false);
    expect(result.desired.coreEndpoint).toBe('213.173.36.232:13232');
  });

  it('bloquea default route y solapamientos del host', () => {
    const result = previewVpsWireguard({ ...valid, allowedIps: ['10.12.248.0/22', '0.0.0.0/0'] }, {
      managementSupernet: '10.12.248.0/22',
      interfaces: { eth0: [{ family: 'IPv4', internal: false, address: '10.12.248.10', netmask: '255.255.255.0', cidr: '10.12.248.10/24' }] },
    });
    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/0\.0\.0\.0\/0/);
    expect(result.conflicts).toHaveLength(1);
  });

  it('exige una IP /32 dentro del segmento VPS', () => {
    const result = previewVpsWireguard({ ...valid, address: '10.12.249.60/32' }, { managementSupernet: '10.12.248.0/22', interfaces: {} });
    expect(result.valid).toBe(false);
    expect(result.blockers.join(' ')).toContain('10.12.250.0/24');
  });
});
