// ============================================================
//  passwordReset.test.js — endpoints /api/auth/password-reset/*
//
//  Crítico: VERIFICAR la propiedad anti-enumeración (mismo response
//  para email existente y no existente) y el flujo single-use del token.
//
//  Estrategia: stub de db/mysql + lib/mailer + auth.middleware via
//  require.cache hack. Montamos Express con SOLO authRoutes.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');
const path = require('node:path');

// ── Stubs ANTES de require al router ────────────────────────────
const mysqlMocks = stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  withTransaction: vi.fn(),
});

const mailerMocks = stubModule(__dirname, '../../lib/mailer', {
  sendOtp: vi.fn().mockResolvedValue({ delivered: true, dev: false }),
  sendInvitation: vi.fn().mockResolvedValue({ delivered: true, dev: false }),
  sendPasswordReset: vi.fn().mockResolvedValue({ delivered: true, dev: false }),
});

// authJwt invalidateUserCache se usa al confirmar reset → mock noop
const authJwtMocks = stubModule(__dirname, '../../middleware/authJwt', {
  requireSession: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  requirePlatformAdmin: (req, res, next) => next(),
  invalidateUserCache: vi.fn(),
});

const sessionServiceMocks = stubModule(__dirname, '../../lib/sessionService', {
  revokeAllSessions: vi.fn().mockResolvedValue(1),
});

// JWT_SECRET requerido por auth.middleware → stub minimalista
stubModule(__dirname, '../../auth.middleware', {
  JWT_SECRET: 'test-jwt-secret',
  verifyToken: (req, res, next) => next(),
});

// db.service tiene hasUsers, getUserByUsername, createUser → noop
stubModule(__dirname, '../../db.service', {
  hasUsers: vi.fn().mockResolvedValue(true),
  getUserByUsername: vi.fn().mockResolvedValue(null),
  createUser: vi.fn(),
  createInitialUser: vi.fn(),
  updateLegacyPasswordHashIfCurrent: vi.fn(),
  encryptPass: (s) => s,
  decryptPass: (s) => s,
  getAppSetting: vi.fn(),
});

// sessionBridge no se ejercita en este test
stubModule(__dirname, '../../lib/sessionBridge', {
  buildSessionForLegacyUser: vi.fn(),
  authenticateMysqlUser: vi.fn().mockResolvedValue(null),
});

const userRepoMocks = stubModule(__dirname, '../../db/repos/userRepo', {
  findByEmail: vi.fn(),
  findById: vi.fn(),
});

const prMocks = stubModule(__dirname, '../../db/repos/passwordResetRepo', {
  TTL_MS: 15 * 60 * 1000,
  generateToken: vi.fn().mockResolvedValue({ token: 'tk-claro', hash: '$2a$hash' }),
  create: vi.fn().mockResolvedValue({ id: 'pr1', expiresAt: Date.now() + 9e5 }),
  findValid: vi.fn(),
  markUsed: vi.fn(),
  invalidateForUser: vi.fn(),
  countRecent: vi.fn().mockResolvedValue(0),
});
const accountSecurityMocks = stubModule(__dirname, '../../db/repos/accountLoginSecurityRepo', {
  get: vi.fn(), unlock: vi.fn().mockResolvedValue(true),
});
const webObservationMocks = stubModule(__dirname, '../../lib/webSecurityObservation', {
  record: vi.fn().mockResolvedValue(undefined),
});

// rateLimit stubeado para no usar BD real
stubModule(__dirname, '../../lib/rateLimit', {
  clientIp: (req) => req.ip || '127.0.0.1',
  recordAttempt: vi.fn(),
  isBlocked: vi.fn().mockResolvedValue(false),
  guard: () => (req, res, next) => { req._clientIp = '127.0.0.1'; next(); },
  guardPolicy: () => (req, res, next) => { req._clientIp = '127.0.0.1'; next(); },
  clearSuccessfulIdentity: vi.fn(),
  clearLoginIdentityBlocks: vi.fn().mockResolvedValue(2),
  MAX_FAILS: 5,
  WINDOW_MS: 900_000,
});

// Resuelvo path absoluto al router (para limpiar el cache al final)
const ROUTES_PATH = require.resolve(path.join(__dirname, '..', '..', 'auth.routes'));

// ── Build Express app con SOLO el router de auth ────────────────
const express = require('express');
const request = require('supertest');
const authRoutes = require('../../auth.routes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const GENERIC_MSG = /Si el correo está registrado, te enviamos un enlace/;

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults razonables
  userRepoMocks.findByEmail.mockResolvedValue(null);
  prMocks.countRecent.mockResolvedValue(0);
});

afterAll(() => {
  // Limpio el cache para no contaminar otros tests
  delete require.cache[ROUTES_PATH];
});

describe('POST /api/auth/password-reset/request — anti-enumeración', () => {
  it('email INEXISTENTE → 200 con mensaje genérico', async () => {
    userRepoMocks.findByEmail.mockResolvedValue(null);
    const r = await request(app).post('/api/auth/password-reset/request')
      .send({ email: 'noexiste@test.com' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.message).toMatch(GENERIC_MSG);
    // Sí se paga el mismo hash de token; no se persiste ni se envía.
    expect(prMocks.countRecent).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000000', expect.any(Number),
    );
    expect(prMocks.generateToken).toHaveBeenCalledTimes(1);
    expect(prMocks.create).not.toHaveBeenCalled();
    expect(mailerMocks.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('email EXISTENTE → 200 con MISMO mensaje genérico + token + mail', async () => {
    userRepoMocks.findByEmail.mockResolvedValue({ id: 'u1', email: 'real@test.com', name: 'Real' });
    const r = await request(app).post('/api/auth/password-reset/request')
      .send({ email: 'real@test.com' });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(GENERIC_MSG);
    expect(prMocks.generateToken).toHaveBeenCalledTimes(1);
    expect(prMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      tokenHash: '$2a$hash',
    }));
    expect(mailerMocks.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'real@test.com', token: 'tk-claro' }),
    );
  });

  it('email mal formado → 400 (zod validation)', async () => {
    const r = await request(app).post('/api/auth/password-reset/request')
      .send({ email: 'no-es-un-email' });
    expect(r.status).toBe(400);
    expect(prMocks.generateToken).not.toHaveBeenCalled();
  });

  it('user con > MAX tokens recientes → silencioso (sin envío) pero mismo response', async () => {
    userRepoMocks.findByEmail.mockResolvedValue({ id: 'u2', email: 'flooded@test.com', name: 'X' });
    prMocks.countRecent.mockResolvedValue(99);
    const r = await request(app).post('/api/auth/password-reset/request')
      .send({ email: 'flooded@test.com' });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(GENERIC_MSG);
    // Se conserva el trabajo criptográfico aunque el límite silencioso aplique.
    expect(prMocks.generateToken).toHaveBeenCalledTimes(1);
    expect(prMocks.create).not.toHaveBeenCalled();
    expect(mailerMocks.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('correo existente e inexistente devuelven exactamente el mismo contrato HTTP', async () => {
    userRepoMocks.findByEmail.mockResolvedValueOnce(null);
    const missing = await request(app).post('/api/auth/password-reset/request')
      .send({ email: 'missing@test.com' });

    userRepoMocks.findByEmail.mockResolvedValueOnce({ id: 'u3', email: 'real2@test.com', name: 'Real' });
    const existing = await request(app).post('/api/auth/password-reset/request')
      .send({ email: 'real2@test.com' });

    expect({ status: existing.status, body: existing.body })
      .toEqual({ status: missing.status, body: missing.body });
  });
});

describe('POST /api/auth/password-reset/confirm — single-use', () => {
  it('token válido → 200 + UPDATE password + markUsed + invalidate', async () => {
    prMocks.findValid.mockResolvedValue({ id: 'pr1', userId: 'u1' });
    userRepoMocks.findById.mockResolvedValue({ id: 'u1', email: 'real@test.com', name: 'Real' });
    accountSecurityMocks.get.mockResolvedValue({ last_failure_ip: '198.51.100.20' });
    mysqlMocks.query.mockResolvedValue({});
    const r = await request(app).post('/api/auth/password-reset/confirm')
      .send({ token: 'a'.repeat(64), newPassword: 'NuevaPass123' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    // UPDATE users password
    expect(mysqlMocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE users SET password_hash/i),
      expect.arrayContaining([expect.any(String), expect.any(Number), 'u1']),
    );
    expect(prMocks.markUsed).toHaveBeenCalledWith('pr1');
    expect(prMocks.invalidateForUser).toHaveBeenCalledWith('u1');
    expect(sessionServiceMocks.revokeAllSessions).toHaveBeenCalledWith('u1');
    const rateLimit = require('../../lib/rateLimit');
    expect(rateLimit.clearLoginIdentityBlocks).toHaveBeenCalledWith({
      identities: ['real@test.com', 'Real'],
    });
    expect(webObservationMocks.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ACCOUNT_RECOVERY', sourceIp: '198.51.100.20', userId: 'u1',
      decision: 'PASSWORD_RECOVERY_COMPLETED',
    }));
  });

  it('token INVÁLIDO (no encontrado) → 401 INVALID_TOKEN sin tocar BD', async () => {
    prMocks.findValid.mockResolvedValue(null);
    const r = await request(app).post('/api/auth/password-reset/confirm')
      .send({ token: 'b'.repeat(64), newPassword: 'OtraPass123!' });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('INVALID_TOKEN');
    // No UPDATE password ni markUsed
    expect(prMocks.markUsed).not.toHaveBeenCalled();
    expect(sessionServiceMocks.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('newPassword < 12 chars → 400 (zod)', async () => {
    const r = await request(app).post('/api/auth/password-reset/confirm')
      .send({ token: 'c'.repeat(64), newPassword: '123' });
    expect(r.status).toBe(400);
    expect(prMocks.findValid).not.toHaveBeenCalled();
  });

  it('token con longitud incorrecta → 400', async () => {
    const r = await request(app).post('/api/auth/password-reset/confirm')
      .send({ token: 'corto', newPassword: 'ValidPass123' });
    expect(r.status).toBe(400);
  });
});
