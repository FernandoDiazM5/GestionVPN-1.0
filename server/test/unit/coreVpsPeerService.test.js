const { previewCoreVpsPeer } = require('../../lib/coreVpsPeerService');

const key = 'A'.repeat(43) + '=';
const desired = { corePublicKey: key, coreEndpointPort: 13232 };

describe('coreVpsPeerService', () => {
  it('previsualiza sólo el peer VPS cuando el Core coincide', async () => {
    const result = await previewCoreVpsPeer({
      desired, vpsPublicKey: key, creds: { ip: 'core', user: 'u', pass: 'p' },
      interfaces: [{ name: 'VPN-WG-VPS', 'public-key': key, 'listen-port': '13232' }], peers: [],
    });
    expect(result.valid).toBe(true);
    expect(result.changes).toEqual([{ field: 'peer', action: 'CREATE' }]);
    expect(result.actions.join(' ')).toContain('únicamente');
  });

  it('bloquea una clave de Core que no coincide', async () => {
    const result = await previewCoreVpsPeer({
      desired, vpsPublicKey: key, creds: { ip: 'core', user: 'u', pass: 'p' },
      interfaces: [{ name: 'VPN-WG-VPS', 'public-key': `${'B'.repeat(43)}=`, 'listen-port': '13232' }], peers: [],
    });
    expect(result.canSync).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/no coincide/);
  });
});
