const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { stubModule } = require('../helpers/moduleMock');

const configMocks = stubModule(__dirname, '../../lib/federatedAuthConfig', {
  readFederatedAuthConfig: vi.fn(),
});
const providerMocks = stubModule(__dirname, '../../lib/firebaseIdentityProvider', {
  verifyFirebaseIdToken: vi.fn(),
  revokeFirebaseSessions: vi.fn(),
});
const sessionMocks = stubModule(__dirname, '../../lib/sessionService', {
  issueSession: vi.fn(),
});
const jwtMocks = stubModule(__dirname, '../../lib/jwt', {
  setSessionCookie: vi.fn(),
});
const identityMocks = stubModule(__dirname, '../../db/repos/authIdentityRepo', {
  findLoginContext: vi.fn(),
  markVerified: vi.fn(),
  findByUser: vi.fn(),
  findBySubject: vi.fn(),
  link: vi.fn(),
  reactivate: vi.fn(),
  setDisabled: vi.fn(),
});
const userMocks = stubModule(__dirname, '../../db/repos/userRepo', {
  findById: vi.fn(),
});
const passwordMocks = stubModule(__dirname, '../../lib/passwordHasher', {
  verifyPassword: vi.fn(),
});
const legacyMocks = stubModule(__dirname, '../../db.service', {
  getUserByUsername: vi.fn(),
});
stubModule(__dirname, '../../middleware/authJwt', {
  requireSession: (req, _res, next) => {
    req.account = {
      sub: 'user-1', email: 'user@example.com', workspace_id: 'ws-1', role: 'OWNER',
      platform_admin: req.get('x-test-platform-admin') === '1',
    };
    next();
  },
});
stubModule(__dirname, '../../lib/rateLimit', {
  guardPolicy: () => (req, _res, next) => next(),
});

const federatedRoutes = require('../../routes/federatedAuth.routes');
const { errorMiddleware } = require('../../lib/apiResponse');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use(cookieParser());
  instance.use('/api/account/federated', federatedRoutes);
  instance.use(errorMiddleware);
  return instance;
}

function linkedContext(overrides = {}) {
  return {
    user_id: 'user-1',
    email_at_link: 'user@example.com',
    email: 'user@example.com',
    name: 'User',
    email_verified: 1,
    disabled_at: null,
    deleted_at: null,
    is_platform_admin: 0,
    workspace_id: 'ws-1',
    role: 'OWNER',
    workspace_name: 'Workspace',
    ...overrides,
  };
}

async function bootstrap(agent) {
  const response = await agent.get('/api/account/federated/csrf').expect(200);
  expect(response.headers['cache-control']).toBe('no-store');
  return response.body.csrfToken;
}

beforeEach(() => {
  vi.clearAllMocks();
  configMocks.readFederatedAuthConfig.mockReturnValue({
    enabled: true, provider: 'firebase', tenantKey: '',
  });
  providerMocks.verifyFirebaseIdToken.mockResolvedValue({
    provider: 'firebase', tenantKey: '', subject: 'firebase-uid-1', email: 'user@example.com',
    signInProvider: 'google.com',
  });
  providerMocks.revokeFirebaseSessions.mockResolvedValue(undefined);
  identityMocks.findLoginContext.mockResolvedValue(linkedContext());
  identityMocks.markVerified.mockResolvedValue(true);
  identityMocks.findByUser.mockResolvedValue(null);
  identityMocks.findBySubject.mockResolvedValue(null);
  identityMocks.link.mockResolvedValue('identity-1');
  identityMocks.reactivate.mockResolvedValue(true);
  identityMocks.setDisabled.mockResolvedValue(true);
  userMocks.findById.mockResolvedValue({
    id: 'user-1', email: 'user@example.com', password_hash: 'hash',
    email_verified: 1, disabled_at: null, deleted_at: null,
  });
  passwordMocks.verifyPassword.mockResolvedValue(true);
  legacyMocks.getUserByUsername.mockResolvedValue(null);
  sessionMocks.issueSession.mockResolvedValue({ token: 'local-session' });
});

describe('piloto de autenticacion federada', () => {
  it('permanece cerrado con el flag apagado', async () => {
    configMocks.readFederatedAuthConfig.mockReturnValue({ enabled: false });
    const response = await request(app()).get('/api/account/federated/csrf').expect(404);
    expect(response.body.code).toBe('FEDERATED_AUTH_DISABLED');
    expect(providerMocks.verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it('intercambia una identidad vinculada por una sesion local revocable', async () => {
    const agent = request.agent(app());
    const csrfToken = await bootstrap(agent);
    const response = await agent.post('/api/account/federated/exchange')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', csrfToken)
      .send({ idToken: 'x'.repeat(100) })
      .expect(200);

    expect(providerMocks.verifyFirebaseIdToken).toHaveBeenCalledWith(
      'x'.repeat(100),
      { requiredSignInProvider: 'google.com' },
    );
    expect(identityMocks.findLoginContext).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'firebase', subject: 'firebase-uid-1',
    }));
    expect(sessionMocks.issueSession).toHaveBeenCalledWith(expect.objectContaining({
      sub: 'user-1', workspace_id: 'ws-1', role: 'OWNER',
    }));
    expect(jwtMocks.setSessionCookie).toHaveBeenCalledWith(expect.anything(), 'local-session');
    expect(response.body.user).toMatchObject({ id: 'user-1', workspace_id: 'ws-1' });
  });

  it('exige Origin y doble token CSRF', async () => {
    const agent = request.agent(app());
    await bootstrap(agent);
    const response = await agent.post('/api/account/federated/exchange')
      .set('Origin', 'http://localhost:5173')
      .send({ idToken: 'x'.repeat(100) })
      .expect(403);
    expect(response.body.code).toBe('CSRF_INVALID');
    expect(providerMocks.verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it('vincula Google al usuario autenticado sin recibir UID manualmente', async () => {
    const response = await request(app()).post('/api/account/federated/link')
      .send({ idToken: 'x'.repeat(100), currentPassword: 'password-seguro' })
      .expect(200);

    expect(passwordMocks.verifyPassword).toHaveBeenCalledWith('password-seguro', 'hash');
    expect(providerMocks.verifyFirebaseIdToken).toHaveBeenCalledWith(
      'x'.repeat(100),
      { requiredSignInProvider: 'google.com' },
    );
    expect(identityMocks.link).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'firebase',
      tenantKey: '',
      subject: 'firebase-uid-1',
      emailAtLink: 'user@example.com',
    });
    expect(response.body).toMatchObject({ linked: true, email: 'user@example.com' });
  });

  it('rechaza vincular una cuenta Google con correo diferente', async () => {
    providerMocks.verifyFirebaseIdToken.mockResolvedValueOnce({
      provider: 'firebase', tenantKey: '', subject: 'firebase-uid-2', email: 'other@example.com',
    });
    const response = await request(app()).post('/api/account/federated/link')
      .send({ idToken: 'x'.repeat(100), currentPassword: 'password-seguro' })
      .expect(409);
    expect(response.body.code).toBe('EMAIL_MISMATCH');
    expect(identityMocks.link).not.toHaveBeenCalled();
  });

  it('verifica la contraseña local antes de consultar Firebase', async () => {
    passwordMocks.verifyPassword.mockResolvedValueOnce(false);
    const response = await request(app()).post('/api/account/federated/link')
      .send({ idToken: 'x'.repeat(100), currentPassword: 'incorrecta' })
      .expect(401);
    expect(response.body.code).toBe('BAD_CURRENT');
    expect(providerMocks.verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it('reautentica al administrador con su credencial legacy real', async () => {
    userMocks.findById.mockResolvedValueOnce({
      id: 'user-1', email: 'admin@example.com', name: 'admin', password_hash: 'random-bridge-hash',
      email_verified: 1, disabled_at: null, deleted_at: null,
    });
    legacyMocks.getUserByUsername.mockResolvedValueOnce({ password_hash: 'legacy-admin-hash' });
    providerMocks.verifyFirebaseIdToken.mockResolvedValueOnce({
      provider: 'firebase', tenantKey: '', subject: 'firebase-uid-admin', email: 'admin@example.com',
    });

    await request(app()).post('/api/account/federated/link')
      .set('x-test-platform-admin', '1')
      .send({ idToken: 'x'.repeat(100), currentPassword: 'password-admin' })
      .expect(200);

    expect(legacyMocks.getUserByUsername).toHaveBeenCalledWith('admin');
    expect(passwordMocks.verifyPassword).toHaveBeenCalledWith('password-admin', 'legacy-admin-hash');
  });

  it('desvincula de forma reversible y revoca sesiones Firebase', async () => {
    identityMocks.findByUser.mockResolvedValueOnce({
      id: 'identity-1', user_id: 'user-1', provider_subject: 'firebase-uid-1', disabled_at: null,
    });
    const response = await request(app()).post('/api/account/federated/unlink')
      .send({ currentPassword: 'password-seguro' })
      .expect(200);
    expect(identityMocks.setDisabled).toHaveBeenCalledWith({
      id: 'identity-1', disabledAt: expect.any(Number),
    });
    expect(providerMocks.revokeFirebaseSessions).toHaveBeenCalledWith('firebase-uid-1');
    expect(response.body.linked).toBe(false);
  });

  it.each([
    ['token invalido', () => providerMocks.verifyFirebaseIdToken.mockRejectedValue(new Error('bad token'))],
    ['identidad sin vincular', () => identityMocks.findLoginContext.mockResolvedValue(null)],
    ['usuario suspendido', () => identityMocks.findLoginContext.mockResolvedValue(linkedContext({ disabled_at: 1 }))],
    ['email distinto', () => identityMocks.findLoginContext.mockResolvedValue(linkedContext({ email: 'other@example.com' }))],
  ])('no enumera cuentas cuando falla: %s', async (_label, arrange) => {
    arrange();
    const agent = request.agent(app());
    const csrfToken = await bootstrap(agent);
    const response = await agent.post('/api/account/federated/exchange')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', csrfToken)
      .send({ idToken: 'x'.repeat(100) })
      .expect(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Correo o contraseña incorrectos',
      code: 'BAD_CREDENTIALS',
    });
  });
});
