const path = require('node:path');
const { stubModule } = require('../helpers/moduleMock');

const dbServiceMocks = stubModule(__dirname, '../../db.service', {
  hasUsers: vi.fn().mockResolvedValue(true),
  getUserByUsername: vi.fn(),
  createInitialUser: vi.fn(),
  updateLegacyPasswordHashIfCurrent: vi.fn(),
});

const passwordMocks = stubModule(__dirname, '../../lib/passwordHasher', {
  hashPassword: vi.fn(),
  verifyAndUpgrade: vi.fn(),
});

const bridgeMocks = stubModule(__dirname, '../../lib/sessionBridge', {
  buildSessionForLegacyUser: vi.fn(),
  authenticateMysqlUser: vi.fn(),
});

stubModule(__dirname, '../../lib/jwt', {
  setSessionCookie: vi.fn(),
});

stubModule(__dirname, '../../db/repos/userRepo', {
  findByEmail: vi.fn(),
});

stubModule(__dirname, '../../db/repos/passwordResetRepo', {
  countRecent: vi.fn(),
  generateToken: vi.fn(),
  create: vi.fn(),
  findValid: vi.fn(),
  markUsed: vi.fn(),
  invalidateForUser: vi.fn(),
});

stubModule(__dirname, '../../lib/mailer', {
  sendPasswordReset: vi.fn(),
});

stubModule(__dirname, '../../middleware/authJwt', {
  invalidateUserCache: vi.fn(),
});

stubModule(__dirname, '../../auth.middleware', {
  verifyToken: (_req, _res, next) => next(),
});

stubModule(__dirname, '../../lib/rateLimit', {
  guardPolicy: () => (req, _res, next) => {
    req._clientIp = '127.0.0.1';
    next();
  },
  clearSuccessfulIdentity: vi.fn(),
});

const metricsMocks = stubModule(__dirname, '../../lib/metrics', {
  authFailsTotal: { inc: vi.fn() },
});

const ROUTES_PATH = require.resolve(path.join(__dirname, '..', '..', 'auth.routes'));
const express = require('express');
const request = require('supertest');
const authRoutes = require('../../auth.routes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const credentials = {
  username: 'user@example.com',
  password: 'correct horse battery staple',
};
const expectedFailure = {
  success: false,
  message: 'Correo o contraseña incorrectos',
  code: 'BAD_CREDENTIALS',
};

beforeEach(() => {
  vi.clearAllMocks();
  dbServiceMocks.getUserByUsername.mockResolvedValue(null);
  passwordMocks.verifyAndUpgrade.mockResolvedValue({ valid: false, upgraded: false, dummy: false });
  bridgeMocks.authenticateMysqlUser.mockResolvedValue(null);
});

afterAll(() => {
  delete require.cache[ROUTES_PATH];
});

describe('POST /api/auth/login anti-enumeración', () => {
  it('usuario inexistente y usuario legacy con clave incorrecta responden igual', async () => {
    const missing = await request(app).post('/api/auth/login').send(credentials);

    dbServiceMocks.getUserByUsername.mockResolvedValueOnce({
      username: credentials.username,
      password_hash: '$argon2id$stored',
      role: 'viewer',
    });
    const wrongPassword = await request(app).post('/api/auth/login').send(credentials);

    expect({ status: missing.status, body: missing.body }).toEqual({
      status: 401,
      body: expectedFailure,
    });
    expect({ status: wrongPassword.status, body: wrongPassword.body }).toEqual({
      status: 401,
      body: expectedFailure,
    });
  });

  it('no hace una segunda autenticación multi-tenant tras fallar un hash legacy', async () => {
    dbServiceMocks.getUserByUsername.mockResolvedValue({
      username: credentials.username,
      password_hash: '$argon2id$stored',
      role: 'viewer',
    });

    await request(app).post('/api/auth/login').send(credentials).expect(401);

    expect(passwordMocks.verifyAndUpgrade).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.authenticateMysqlUser).not.toHaveBeenCalled();
    expect(metricsMocks.authFailsTotal.inc).toHaveBeenCalledWith({ reason: 'bad_password' });
  });
});
