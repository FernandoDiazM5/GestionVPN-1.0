import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const securityRepo = {
  createStepUp: vi.fn(), consumeStepUp: vi.fn(), audit: vi.fn(), history: vi.fn(),
  trustAdd: vi.fn(), trustRemove: vi.fn(), trustList: vi.fn(),
};
const agent = { callSecurityAgent: vi.fn() };
stubModule(__dirname, '../../db/repos/platformSecurityRepo', securityRepo);
stubModule(__dirname, '../../lib/securityAgentClient', agent);
stubModule(__dirname, '../../lib/passwordHasher', { verifyPassword: vi.fn(async () => true) });
stubModule(__dirname, '../../db/repos/userRepo', { findById: vi.fn(async id => ({ id, password_hash: 'hash' })) });
stubModule(__dirname, '../../db/repos/authIdentityRepo', { findByUser: vi.fn() });
stubModule(__dirname, '../../db/repos/notificationRepo', { getByUser: vi.fn(async () => null) });
stubModule(__dirname, '../../lib/telegram', { sendMessage: vi.fn() });
stubModule(__dirname, '../../lib/rateLimit', {
  clientIp: req => String(req.headers['x-test-ip'] || '203.0.113.10'),
  guardPolicy: () => (_req, _res, next) => next(),
});
stubModule(__dirname, '../../middleware/authJwt', {
  requireSession: (req, res, next) => req.account ? next() : res.status(401).json({ code: 'NO_SESSION' }),
  requirePlatformAdmin: (req, res, next) => req.account?.platform_admin
    ? next() : res.status(403).json({ code: 'NOT_PLATFORM_ADMIN' }),
});

const express = require('express');
const request = require('supertest');
const routes = require('../../routes/adminSecurity.routes');
const { errorMiddleware } = require('../../lib/apiResponse');
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (req.headers['x-test-role']) req.account = {
    sub: 'admin-1', jti: '00000000-0000-4000-8000-000000000001',
    platform_admin: req.headers['x-test-role'] === 'admin',
  };
  next();
});
app.use('/api/admin/security', routes);
app.use(errorMiddleware);

const mutation = {
  target: '198.51.100.7', jail: 'sshd', duration: '1h', category: 'MAINTENANCE',
  reason: 'Mantenimiento autorizado', stepUpToken: 'x'.repeat(32),
};

describe('seguridad administrativa del VPS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    securityRepo.consumeStepUp.mockResolvedValue(true);
    securityRepo.audit.mockResolvedValue(undefined);
    securityRepo.history.mockResolvedValue([]);
    securityRepo.trustList.mockResolvedValue([]);
    agent.callSecurityAgent.mockResolvedValue({ jails: [], trusted: [] });
  });

  it('niega todo el módulo a usuarios que no son platform_admin', async () => {
    const response = await request(app).get('/api/admin/security/status').set('x-test-role', 'owner');
    expect(response.status).toBe(403);
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('expone estado sólo al administrador e informa su IP efectiva', async () => {
    const response = await request(app).get('/api/admin/security/status')
      .set('x-test-role', 'admin').set('x-test-ip', '203.0.113.44');
    expect(response.status).toBe(200);
    expect(response.body.currentIp).toBe('203.0.113.44');
  });

  it('impide bloquear la IP de la sesión antes de tocar Fail2ban', async () => {
    const response = await request(app).post('/api/admin/security/ban')
      .set('x-test-role', 'admin').set('x-test-ip', mutation.target).send(mutation);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SELF_LOCKOUT');
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('exige confirmación adicional para un bloqueo indefinido', async () => {
    const response = await request(app).post('/api/admin/security/ban')
      .set('x-test-role', 'admin').send({ ...mutation, duration: 'indefinite' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CONFIRM_INDEFINITE');
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('exige confirmación adicional para confiar en una red CIDR', async () => {
    const response = await request(app).post('/api/admin/security/trust')
      .set('x-test-role', 'admin').send({ ...mutation, target: '192.0.2.0/24' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CONFIRM_NETWORK_TRUST');
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('desbloquea mediante el agente autorizado y registra auditoría', async () => {
    agent.callSecurityAgent.mockResolvedValue({ target: mutation.target, jail: 'sshd' });
    const response = await request(app).post('/api/admin/security/unban')
      .set('x-test-role', 'admin').send(mutation);
    expect(response.status).toBe(200);
    expect(agent.callSecurityAgent).toHaveBeenCalledWith('unban', { target: mutation.target, jail: 'sshd' });
    expect(securityRepo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UNBAN', outcome: 'SUCCESS' }));
  });
});
