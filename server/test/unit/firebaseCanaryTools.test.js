const { stubModule } = require('../helpers/moduleMock');

const mysqlMocks = stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  closePool: vi.fn().mockResolvedValue(undefined),
});
const repoMocks = stubModule(__dirname, '../../db/repos/authIdentityRepo', {
  findByUser: vi.fn(),
  findBySubject: vi.fn(),
  link: vi.fn(),
  setDisabled: vi.fn(),
  reactivate: vi.fn(),
});
const sessionRepoMocks = stubModule(__dirname, '../../db/repos/authSessionRepo', {
  revokeAll: vi.fn(),
});
const configMocks = stubModule(__dirname, '../../lib/federatedAuthConfig', {
  readFederatedAuthConfig: vi.fn(),
});
const providerMocks = stubModule(__dirname, '../../lib/firebaseIdentityProvider', {
  getFirebaseUser: vi.fn(),
  revokeFirebaseSessions: vi.fn(),
  probeFirebaseAuthAccess: vi.fn(),
});

const canary = require('../../tools/firebase-canary');
const preflight = require('../../tools/firebase-staging-preflight');

const localOwner = {
  id: 'user-1',
  email: 'owner@example.com',
  email_verified: 1,
  disabled_at: null,
  deleted_at: null,
  is_platform_admin: 0,
  workspace_id: 'ws-1',
  role: 'OWNER',
  workspace_deleted_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FIREBASE_PILOT_ENV = 'staging';
  configMocks.readFederatedAuthConfig.mockReturnValue({
    enabled: true,
    provider: 'firebase',
    projectId: 'gestion-vpn-pilot',
    tenantId: null,
    tenantKey: '',
  });
  mysqlMocks.query.mockResolvedValue([localOwner]);
  repoMocks.findByUser.mockResolvedValue(null);
  repoMocks.findBySubject.mockResolvedValue(null);
  repoMocks.link.mockResolvedValue('identity-1');
  repoMocks.setDisabled.mockResolvedValue(true);
  repoMocks.reactivate.mockResolvedValue(true);
  sessionRepoMocks.revokeAll.mockResolvedValue(1);
  providerMocks.getFirebaseUser.mockResolvedValue({
    uid: 'firebase-uid-1',
    email: 'owner@example.com',
    emailVerified: true,
    disabled: false,
  });
  providerMocks.revokeFirebaseSessions.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FIREBASE_PILOT_ENV;
});

describe('firebase canary CLI', () => {
  it('es dry-run por defecto y exige confirmacion literal para escribir', () => {
    expect(canary.parseArgs([
      'link', '--email', ' Owner@Example.com ', '--uid', 'firebase-uid-1',
    ])).toMatchObject({ command: 'link', email: 'owner@example.com', apply: false });
    expect(() => canary.parseArgs([
      'link', '--email', 'owner@example.com', '--uid', 'firebase-uid-1', '--apply',
    ])).toThrow('LINK_FIREBASE_CANARY');
  });

  it('vincula solo un OWNER local con identidad Firebase verificada y mismo correo', async () => {
    const args = canary.parseArgs([
      'link', '--email', 'owner@example.com', '--uid', 'firebase-uid-1',
      '--apply', '--confirm', canary.CONFIRM_LINK,
    ]);
    await expect(canary.linkCanary(args)).resolves.toEqual({ action: 'crear', applied: true });
    expect(repoMocks.link).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', subject: 'firebase-uid-1', emailAtLink: 'owner@example.com',
    }));
  });

  it('deshabilita el mapping y revoca sesiones locales antes que Firebase', async () => {
    repoMocks.findByUser.mockResolvedValue({
      id: 'identity-1', user_id: 'user-1', provider_subject: 'firebase-uid-1', disabled_at: null,
    });
    const args = canary.parseArgs([
      'disable', '--email', 'owner@example.com', '--apply',
      '--confirm', canary.CONFIRM_DISABLE,
    ]);
    await expect(canary.disableCanary(args)).resolves.toEqual({ applied: true });
    expect(repoMocks.setDisabled).toHaveBeenCalledWith({
      id: 'identity-1', disabledAt: expect.any(Number),
    });
    expect(repoMocks.setDisabled.mock.invocationCallOrder[0])
      .toBeLessThan(sessionRepoMocks.revokeAll.mock.invocationCallOrder[0]);
    expect(sessionRepoMocks.revokeAll).toHaveBeenCalledWith('user-1');
    expect(sessionRepoMocks.revokeAll.mock.invocationCallOrder[0])
      .toBeLessThan(providerMocks.revokeFirebaseSessions.mock.invocationCallOrder[0]);
  });
});

describe('firebase staging preflight', () => {
  it('valida opciones y nunca expone la ruta de ADC', () => {
    expect(preflight.parseOptions(['--provider', '--json'])).toEqual({ provider: true, json: true });
    expect(() => preflight.parseOptions(['--apply'])).toThrow('no soportadas');
    const checks = preflight.staticChecks({
      FIREBASE_PILOT_ENV: 'staging',
      FEDERATED_AUTH_ENABLED: 'true',
      GOOGLE_APPLICATION_CREDENTIALS: 'C:/secreto/adc.json',
    });
    expect(checks.find(check => check.name === 'adc_source')?.detail).toBe('archivo externo/ADC');
    expect(JSON.stringify(checks)).not.toContain('C:/secreto/adc.json');
  });

  it('acepta el entorno production para el preflight de promoción', () => {
    const checks = preflight.staticChecks({
      FIREBASE_PILOT_ENV: 'production',
      FEDERATED_AUTH_ENABLED: 'true',
      FIREBASE_PROJECT_ID: 'vpn-noc',
    });
    expect(checks.find(check => check.name === 'pilot_environment')).toMatchObject({
      ok: true,
      detail: 'production',
    });
    expect(checks.find(check => check.name === 'backend_feature_flag')?.detail)
      .toBe('habilitada en production');
  });
});
