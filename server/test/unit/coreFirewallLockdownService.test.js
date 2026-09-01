const safeWrite = vi.fn();
const close = vi.fn();
const { stubModule } = require('../helpers/moduleMock');
stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn(async () => ({ close })),
  safeWrite,
  writeIdempotent: vi.fn(),
  parseHandshakeSecs: vi.fn(value => value === '30s' ? 30 : Infinity),
});
stubModule(__dirname, '../../db.service', {
  getAppSetting: vi.fn(async key => ({
    server_public_ip: '38.25.114.72', MT_USER: 'admin', MT_PASS: 'encrypted',
    management_supernet: '10.12.248.0/22', core_local_networks: '192.168.18.0/24',
  })[key] || ''),
  setAppSetting: vi.fn(),
  decryptPass: vi.fn(() => 'secret'),
});

const { parseLocalNetworks, previewCoreFirewallLockdown } = require('../../lib/coreFirewallLockdownService');

describe('coreFirewallLockdownService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    safeWrite.mockImplementation(async (_api, command) => {
      if (command[0] === '/interface/wireguard/print') return [{ name: 'VPN-WG-VPS' }];
      if (command[0] === '/interface/wireguard/peers/print') return [{ interface: 'VPN-WG-VPS', comment: 'GVPN:VPS', 'last-handshake': '30s' }];
      if (command[0] === '/ip/service/print') return [];
      if (command[0] === '/interface/list/print') return [{ name: 'LIST-WAN' }];
      if (command[0] === '/interface/list/member/print') return [{ list: 'LIST-WAN', interface: 'ether1' }];
      return [];
    });
  });

  it('normaliza y deduplica redes locales editables', () => {
    expect(parseLocalNetworks(['192.168.18.0/24', '192.168.18.5/24', 'inválida']))
      .toEqual(['192.168.18.0/24']);
  });

  it('habilita el cierre sólo con administración por túnel y handshake reciente', async () => {
    const preview = await previewCoreFirewallLockdown(['192.168.18.0/24']);
    expect(preview.canApply).toBe(true);
    expect(preview.tunnelHost).toBe('10.12.250.1');
    expect(preview.allowedNetworks).toContain('192.168.18.0/24');
    expect(preview.preserves.join(' ')).toMatch(/NAT/);
  });

  it('bloquea el cierre cuando no hay handshake reciente', async () => {
    safeWrite.mockImplementation(async (_api, command) => {
      if (command[0] === '/interface/wireguard/print') return [{ name: 'VPN-WG-VPS' }];
      if (command[0] === '/interface/wireguard/peers/print') return [{ interface: 'VPN-WG-VPS', comment: 'GVPN:VPS', 'last-handshake': '' }];
      if (command[0] === '/interface/list/print') return [{ name: 'LIST-WAN' }];
      if (command[0] === '/interface/list/member/print') return [{ list: 'LIST-WAN', interface: 'ether1' }];
      return [];
    });
    const preview = await previewCoreFirewallLockdown(['192.168.18.0/24']);
    expect(preview.canApply).toBe(false);
    expect(preview.blockers.join(' ')).toMatch(/handshake reciente/);
  });
});
