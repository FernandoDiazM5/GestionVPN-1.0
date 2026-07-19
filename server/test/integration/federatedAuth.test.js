const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { stubModule } = require('../helpers/moduleMock');

const configMocks = stubModule(__dirname, '../../lib/federatedAuthConfig', {
  readFederatedAuthConfig: vi.fn(),
});
const providerMocks = stubModule(__dirname, '../../lib/firebaseIdentityProvider', {
  verifyFirebaseIdToken: vi.fn(),
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
  configMocks.readFederatedAuthConfig.mockReturnValue({ enabled: true });
  providerMocks.verifyFirebaseIdToken.mockResolvedValue({
    provider: 'firebase', tenantKey: '', subject: 'firebase-uid-1', email: 'user@example.com',
  });
  identityMocks.findLoginContext.mockResolvedValue(linkedContext());
  identityMocks.markVerified.mockResolvedValue(true);
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

    expect(providerMocks.verifyFirebaseIdToken).toHaveBeenCalledWith('x'.repeat(100));
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
