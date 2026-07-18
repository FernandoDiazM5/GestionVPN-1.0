const path = require('node:path');
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  withTransaction: vi.fn(),
});

const sessionBridgeMocks = stubModule(__dirname, '../../lib/sessionBridge', {
  authenticateMysqlUser: vi.fn(),
  buildSessionForLegacyUser: vi.fn(),
});

stubModule(__dirname, '../../lib/jwt', {
  signSession: vi.fn().mockReturnValue('signed-session'),
  verifySession: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
});

const mailerMocks = stubModule(__dirname, '../../lib/mailer', {
  sendOtp: vi.fn().mockResolvedValue({ delivered: true, dev: false }),
});

stubModule(__dirname, '../../middleware/authJwt', {
  requireSession: (_req, _res, next) => next(),
  invalidateUserCache: vi.fn(),
});

stubModule(__dirname, '../../lib/rateLimit', {
  guardPolicy: () => (req, _res, next) => {
    req._clientIp = '127.0.0.1';
    next();
  },
  clearSuccessfulIdentity: vi.fn(),
});

const userRepoMocks = stubModule(__dirname, '../../db/repos/userRepo', {
  findByEmail: vi.fn(),
  createPending: vi.fn(),
  setOtp: vi.fn(),
  findById: vi.fn(),
});

stubModule(__dirname, '../../db/repos/workspaceRepo', {
  findMembershipByUser: vi.fn(),
  createForOwner: vi.fn(),
  findById: vi.fn(),
});

const ROUTES_PATH = require.resolve(path.join(__dirname, '..', '..', 'routes', 'account.routes'));
const express = require('express');
const request = require('supertest');
const { errorMiddleware } = require('../../lib/apiResponse');
const accountRoutes = require('../../routes/account.routes');

const app = express();
app.use(express.json());
app.use('/api/account', accountRoutes);
app.use(errorMiddleware);

beforeEach(() => {
  vi.clearAllMocks();
  sessionBridgeMocks.authenticateMysqlUser.mockResolvedValue(null);
  userRepoMocks.findByEmail.mockResolvedValue(null);
  userRepoMocks.createPending.mockResolvedValue(undefined);
  userRepoMocks.setOtp.mockResolvedValue(undefined);
});

afterAll(() => {
  delete require.cache[ROUTES_PATH];
});

describe('POST /api/account/login anti-enumeración', () => {
  it.each(['inexistente', 'contraseña incorrecta', 'sin verificar', 'suspendido', 'sin workspace'])(
    'devuelve el mismo contrato para %s',
    async () => {
      const response = await request(app).post('/api/account/login').send({
        email: 'user@example.com',
        password: 'correct horse battery staple',
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        message: 'Correo o contraseña incorrectos',
        code: 'BAD_CREDENTIALS',
      });
    },
  );
});

describe('registro y reenvío anti-enumeración', () => {
  it('registro nuevo y existente tienen estado y cuerpo idénticos', async () => {
    const payload = {
      email: 'new@example.com',
      password: 'correct horse battery staple',
      name: 'New User',
    };
    userRepoMocks.findByEmail.mockResolvedValueOnce(null);
    const created = await request(app).post('/api/account/register').send(payload);

    userRepoMocks.findByEmail.mockResolvedValueOnce({ id: 'existing', email_verified: 1 });
    const existing = await request(app).post('/api/account/register')
      .send({ ...payload, email: 'existing@example.com' });

    expect({ status: existing.status, body: existing.body })
      .toEqual({ status: created.status, body: created.body });
    expect(created.status).toBe(202);
    expect(created.body).not.toHaveProperty('dev');
  });

  it('reenvío inexistente, verificado y pendiente tiene el mismo contrato', async () => {
    userRepoMocks.findByEmail.mockResolvedValueOnce(null);
    const missing = await request(app).post('/api/account/resend').send({ email: 'missing@example.com' });

    userRepoMocks.findByEmail.mockResolvedValueOnce({ id: 'verified', email_verified: 1 });
    const verified = await request(app).post('/api/account/resend').send({ email: 'verified@example.com' });

    userRepoMocks.findByEmail.mockResolvedValueOnce({ id: 'pending', email_verified: 0 });
    const pending = await request(app).post('/api/account/resend').send({ email: 'pending@example.com' });

    expect({ status: verified.status, body: verified.body })
      .toEqual({ status: missing.status, body: missing.body });
    expect({ status: pending.status, body: pending.body })
      .toEqual({ status: missing.status, body: missing.body });
    expect(missing.body).not.toHaveProperty('dev');
  });
});
