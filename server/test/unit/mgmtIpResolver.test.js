// ============================================================
//  mgmtIpResolver.test.js — resolución server-side de la IP de gestión
//  del usuario desde los peers vivos del router (auto-heal del 409).
//
//  Foco: la VALIDACIÓN DE PERTENENCIA por rol (anti-spoofing). El admin
//  solo resuelve su plano ADMIN; el OWNER/MEMBER solo SU propio peer
//  (member_wireguard), nunca los de otros del workspace.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const routerosMocks = stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn(),
  safeWrite: vi.fn(),
});
const memberWgMocks = stubModule(__dirname, '../../db/repos/memberWgRepo', {
  getByUser: vi.fn(),
});
stubModule(__dirname, '../../ubiquiti.service', {
  IPV4_REGEX: /^(\d{1,3}\.){3}\d{1,3}$/,
});

const mgmtNet = require('../../lib/mgmtNet');
const { resolveOwnedMgmtIps } = require('../../lib/mgmtIpResolver');

const ADMIN = mgmtNet.admin.iface;       // VPN-WG-ADMIN
const CLIENTS = mgmtNet.clients.iface;   // VPN-WG-CLIENTES

const mikrotik = { ip: '10.14.250.1', user: 'admin', pass: 'x' };

function withPeers(peers) {
  routerosMocks.connectToMikrotik.mockResolvedValue({ close: vi.fn().mockResolvedValue() });
  routerosMocks.safeWrite.mockResolvedValue(peers);
}

beforeEach(() => {
  routerosMocks.connectToMikrotik.mockReset();
  routerosMocks.safeWrite.mockReset();
  memberWgMocks.getByUser.mockReset();
});

describe('resolveOwnedMgmtIps — platform_admin', () => {
  const admin = { sub: 'u-admin', workspace_id: 'ws-a', role: 'OWNER', platform_admin: true };

  it('resuelve SOLO los peers del plano ADMIN (ignora CLIENTES)', async () => {
    withPeers([
      { interface: ADMIN, 'allowed-address': '10.14.250.2/32', 'public-key': 'KADMIN' },
      { interface: CLIENTS, 'allowed-address': '10.13.250.50/32', 'public-key': 'KCLI' },
    ]);
    const out = await resolveOwnedMgmtIps({ account: admin, mikrotik });
    expect(out).toEqual([{ ip: '10.14.250.2', publicKey: 'KADMIN' }]);
  });

  it('con varios peers ADMIN devuelve todos (ambigüedad → el llamador no auto-cura)', async () => {
    withPeers([
      { interface: ADMIN, 'allowed-address': '10.14.250.2/32', 'public-key': 'K1' },
      { interface: ADMIN, 'allowed-address': '10.14.250.3/32', 'public-key': 'K2' },
    ]);
    const out = await resolveOwnedMgmtIps({ account: admin, mikrotik });
    expect(out).toHaveLength(2);
  });

  it('sin peer en el plano ADMIN devuelve [] (no adivina con CLIENTES)', async () => {
    withPeers([{ interface: CLIENTS, 'allowed-address': '10.13.250.50/32', 'public-key': 'KCLI' }]);
    expect(await resolveOwnedMgmtIps({ account: admin, mikrotik })).toEqual([]);
  });
});

describe('resolveOwnedMgmtIps — OWNER / MEMBER', () => {
  const owner = { sub: 'u-mod', workspace_id: 'ws-a', role: 'OWNER', platform_admin: false };

  it('resuelve SOLO el peer propio (member_wireguard), no los de otros del workspace', async () => {
    memberWgMocks.getByUser.mockResolvedValue({ public_key: 'KME' });
    withPeers([
      { interface: CLIENTS, 'allowed-address': '10.13.250.20/32', 'public-key': 'KME' },     // mío
      { interface: CLIENTS, 'allowed-address': '10.13.250.21/32', 'public-key': 'KOTRO' },    // de un member
    ]);
    const out = await resolveOwnedMgmtIps({ account: owner, mikrotik });
    expect(out).toEqual([{ ip: '10.13.250.20', publicKey: 'KME' }]);
  });

  it('sin fila member_wireguard (peer creado a mano) devuelve [] sin leer ambigüedades', async () => {
    memberWgMocks.getByUser.mockResolvedValue(null);
    withPeers([{ interface: CLIENTS, 'allowed-address': '10.13.250.20/32', 'public-key': 'KME' }]);
    expect(await resolveOwnedMgmtIps({ account: owner, mikrotik })).toEqual([]);
  });

  it('propaga errores del router (caída) para que el llamador los trate como 503', async () => {
    memberWgMocks.getByUser.mockResolvedValue({ public_key: 'KME' });
    routerosMocks.connectToMikrotik.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(resolveOwnedMgmtIps({ account: owner, mikrotik })).rejects.toThrow('ETIMEDOUT');
  });
});
