const { stubModule } = require('../helpers/moduleMock');

const close = vi.fn().mockResolvedValue(undefined);
const connectToMikrotik = vi.fn().mockResolvedValue({ close });
const sessionRepo = stubModule(__dirname, '../../db/repos/sessionRepo', {
  getActiveByUser: vi.fn(),
  closeSession: vi.fn(),
  log: vi.fn(),
});
stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik,
  getErrorMessage: vi.fn((error) => error.message),
  isUnreachable: vi.fn(() => false),
});
stubModule(__dirname, '../../ubiquiti.service', { IPV4_REGEX: /^/ });
stubModule(__dirname, '../../db/repos/mgmtIpRepo', {});
stubModule(__dirname, '../../lib/notifier', { notify: vi.fn().mockResolvedValue(undefined) });
const provisioner = stubModule(__dirname, '../../lib/tunnelProvisioner', {
  findUserMangleIds: vi.fn(),
  removeMangleIds: vi.fn(),
});
stubModule(__dirname, '../../lib/scanMangleSync', { onTunnelClosed: vi.fn() });
stubModule(__dirname, '../../lib/sse', { publish: vi.fn() });
stubModule(__dirname, '../../lib/mgmtIpResolver', { resolveOwnedMgmtIps: vi.fn() });
stubModule(__dirname, '../../routes/core/_shared', {
  canUseTunnelForAccount: vi.fn(),
  emitToUser: vi.fn(),
});

const service = require('../../lib/tunnelService');
const account = { sub: 'user-1', workspace_id: 'ws-1' };
const mikrotik = { ip: '10.0.0.1', user: 'api', pass: 'secret' };

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  connectToMikrotik.mockResolvedValue({ close });
  sessionRepo.getActiveByUser.mockResolvedValue({
    id: 'session-1',
    user_id: 'user-1',
    workspace_id: 'ws-1',
    tunnel_id: 'node-1',
    vrf_name: 'vrf-1',
    expires_at: Date.now() - 1,
  });
  sessionRepo.closeSession.mockResolvedValue(true);
  provisioner.findUserMangleIds.mockResolvedValue(['*A']);
  provisioner.removeMangleIds.mockResolvedValue(1);
});

it('deduplica dos revocaciones simultáneas del mismo usuario', async () => {
  let release;
  provisioner.findUserMangleIds.mockImplementationOnce(() =>
    new Promise((resolve) => { release = () => resolve(['*A']); }),
  );

  const first = service.deactivateTunnel({ account, mikrotik });
  const second = service.deactivateTunnel({ account, mikrotik });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  release();
  const [a, b] = await Promise.all([first, second]);

  expect(a).toEqual(b);
  expect(provisioner.findUserMangleIds).toHaveBeenCalledTimes(1);
  expect(sessionRepo.closeSession).toHaveBeenCalledTimes(1);
});

it('no cierra MySQL cuando MikroTik no confirma la eliminación', async () => {
  provisioner.removeMangleIds.mockRejectedValueOnce(new Error('router timeout'));

  const result = await service.deactivateTunnel({ account, mikrotik, action: 'EXPIRE' });

  expect(result.ok).toBe(false);
  expect(sessionRepo.closeSession).not.toHaveBeenCalled();
});

it('una expiración atrasada no revoca un lease que ya fue renovado', async () => {
  sessionRepo.getActiveByUser.mockResolvedValueOnce({
    id: 'session-1',
    tunnel_id: 'node-1',
    vrf_name: 'vrf-1',
    expires_at: Date.now() + 60_000,
  });

  const result = await service.deactivateTunnel({
    account,
    mikrotik,
    action: 'EXPIRE',
    onlyIfExpired: true,
  });

  expect(result.skipped).toBe(true);
  expect(connectToMikrotik).not.toHaveBeenCalled();
  expect(sessionRepo.closeSession).not.toHaveBeenCalled();
});
