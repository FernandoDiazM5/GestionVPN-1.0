const {
  deriveWanInterface,
  summarizeInventory,
  managementAddressListNetworks,
  vpsPeerAllowedAddresses,
  sameAddressSet,
} = require('../../lib/coreServerService');

describe('coreServerService inventory', () => {
  it('detecta la WAN desde immediate-gw y usa DHCP como respaldo', () => {
    expect(deriveWanInterface([{ active: 'true', 'immediate-gw': '10.0.0.1%ether1' }], [])).toBe('ether1');
    expect(deriveWanInterface([], [{ disabled: 'false', interface: 'sfp1' }])).toBe('sfp1');
  });

  it('marca saludable sólo al core con ruta e interfaces de gestión', () => {
    const summary = summarizeInventory({
      identity: { name: 'CORE' }, resource: { version: '7.20' },
      routes: [{ active: 'true', disabled: 'false' }], interfaces: [],
      wireguard: [{ name: 'VPN-WG-VPS' }, { name: 'VPN-WG-CLIENTES' }, { name: 'VPN-WG-ADMIN' }],
      peers: [], sstpServer: { disabled: 'false', port: '443' }, sstpInterfaces: [],
      pppSecrets: [], vrfs: [], filters: [], wanInterface: 'ether1',
    });
    expect(summary.status).toBe('HEALTHY');
    expect(summary.vpnReady).toBe(true);
    expect(summary.operationalObjects).toBe(0);
  });

  it('confía el pool de escaneo tanto para la ida como para el retorno', () => {
    const lists = managementAddressListNetworks('10.12.248.0/24');

    expect(lists.active).toContain('10.12.248.0/24');
    expect(lists.trusted).toContain('10.12.248.0/24');
    expect(lists.active).toEqual(lists.trusted);
  });

  it('reconcilia el peer VPS con la IP del servidor y el pool vigente', () => {
    const expected = vpsPeerAllowedAddresses('10.12.248.0/24');

    expect(expected).toEqual([`${require('../../lib/mgmtNet').vps.ip}/32`, '10.12.248.0/24']);
    expect(sameAddressSet(expected.join(','), expected)).toBe(true);
    expect(sameAddressSet('10.12.250.60/32,10.11.252.0/24', expected)).toBe(false);
  });
});
