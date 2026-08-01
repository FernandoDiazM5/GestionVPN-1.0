const path = require('node:path');
const { stubModule } = require('../helpers/moduleMock');

const DUMMY_USER_ID = '00000000-0000-0000-0000-000000000000';

stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  withTransaction: vi.fn(),
});

const passwordMocks = stubModule(__dirname, '../../lib/passwordHasher', {
  hashPassword: vi.fn(),
  verifyAndUpgrade: vi.fn(),
});

const sessionMocks = stubModule(__dirname, '../../lib/sessionService', {
  issueSession: vi.fn().mockResolvedValue({ token: 'signed-session' }),
});

const userRepoMocks = stubModule(__dirname, '../../db/repos/userRepo', {
  findByEmail: vi.fn(),
  findByName: vi.fn(),
  updatePasswordHashIfCurrent: vi.fn(),
});

const workspaceRepoMocks = stubModule(__dirname, '../../db/repos/workspaceRepo', {
  findMembershipByUser: vi.fn(),
  createForOwner: vi.fn(),
});

const metricsMocks = stubModule(__dirname, '../../lib/metrics', {
  authFailsTotal: { inc: vi.fn() },
});
const accountSecurityMocks = stubModule(__dirname, '../../db/repos/accountLoginSecurityRepo', {
  status: vi.fn(), recordFailure: vi.fn(), clearAfterSuccess: vi.fn(),
});
const webObservationMocks = stubModule(__dirname, '../../lib/webSecurityObservation', {
  record: vi.fn(), identityHash: vi.fn(value => `hash:${value}`),
});

const BRIDGE_PATH = require.resolve(path.join(__dirname, '..', '..', 'lib', 'sessionBridge'));
const { authenticateMysqlUser } = require('../../lib/sessionBridge');

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  password_hash: '$argon2id$stored',
  email_verified: 1,
  disabled_at: null,
  is_platform_admin: 0,
};
const membership = {
  workspace_id: 'workspace-1',
  workspace_name: 'Workspace',
  role: 'MEMBER',
};

beforeEach(() => {
  vi.clearAllMocks();
  userRepoMocks.findByEmail.mockResolvedValue({ ...baseUser });
  userRepoMocks.findByName.mockResolvedValue(null);
  passwordMocks.verifyAndUpgrade.mockResolvedValue({ valid: true, upgraded: false, dummy: false });
  workspaceRepoMocks.findMembershipByUser.mockResolvedValue({ ...membership });
  accountSecurityMocks.status.mockResolvedValue({ locked: false, lockedUntil: null });
  accountSecurityMocks.recordFailure.mockResolvedValue({ locked: false, lockedUntil: null });
  accountSecurityMocks.clearAfterSuccess.mockResolvedValue(undefined);
  webObservationMocks.record.mockResolvedValue(undefined);
});

afterAll(() => {
  delete require.cache[BRIDGE_PATH];
});

describe('authenticateMysqlUser anti-enumeración', () => {
  it.each([
    ['not_found', null, { valid: false, upgraded: false, dummy: true }, null, DUMMY_USER_ID],
    ['bad_password', { ...baseUser }, { valid: false, upgraded: false, dummy: false }, membership, baseUser.id],
    ['unverified', { ...baseUser, email_verified: 0 }, { valid: true, upgraded: false, dummy: false }, membership, baseUser.id],
    ['disabled', { ...baseUser, disabled_at: 123 }, { valid: true, upgraded: false, dummy: false }, membership, baseUser.id],
    ['no_membership', { ...baseUser }, { valid: true, upgraded: false, dummy: false }, null, baseUser.id],
  ])('oculta %s después de verificar hash y consultar membresía', async (
    reason, user, verification, foundMembership, membershipLookupId,
  ) => {
    userRepoMocks.findByEmail.mockResolvedValue(user);
    passwordMocks.verifyAndUpgrade.mockResolvedValue(verification);
    workspaceRepoMocks.findMembershipByUser.mockResolvedValue(foundMembership);

    await expect(authenticateMysqlUser('user@example.com', 'password-value')).resolves.toBeNull();

    expect(passwordMocks.verifyAndUpgrade).toHaveBeenCalledTimes(1);
    expect(workspaceRepoMocks.findMembershipByUser).toHaveBeenCalledWith(membershipLookupId);
    expect(metricsMocks.authFailsTotal.inc).toHaveBeenCalledWith({ reason });
    expect(sessionMocks.issueSession).not.toHaveBeenCalled();
  });

  it('hace siempre lookup por email y nombre para usernames cortos', async () => {
    await expect(authenticateMysqlUser('user', 'password-value')).resolves.toMatchObject({
      token: 'signed-session',
    });

    expect(userRepoMocks.findByEmail).toHaveBeenCalledWith('user@local.app');
    expect(userRepoMocks.findByName).toHaveBeenCalledWith('user');
  });

  it('devuelve el bloqueo solo al flujo que solicita el detalle', async () => {
    accountSecurityMocks.status.mockResolvedValue({ locked: true, lockedUntil: 123456 });
    await expect(authenticateMysqlUser('user@example.com', 'password-value', { includeFailure: true }))
      .resolves.toEqual({ denied: 'locked', lockedUntil: 123456 });
    expect(sessionMocks.issueSession).not.toHaveBeenCalled();
  });

  it('observa una contraseña incorrecta sin guardar la identidad en claro', async () => {
    passwordMocks.verifyAndUpgrade.mockResolvedValue({ valid: false, upgraded: false, dummy: false });
    await authenticateMysqlUser('user@example.com', 'incorrecta', { requestIp: '203.0.113.9' });
    expect(webObservationMocks.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'AUTH_FAILURE', sourceIp: '203.0.113.9', identityHash: 'hash:user@example.com',
      userId: baseUser.id,
    }));
    expect(JSON.stringify(webObservationMocks.record.mock.calls)).not.toContain('incorrecta');
  });
});
