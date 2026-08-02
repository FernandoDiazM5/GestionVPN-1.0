import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const securityRepo = {
  createStepUp: vi.fn(), consumeStepUp: vi.fn(), audit: vi.fn(), history: vi.fn(),
  trustAdd: vi.fn(), trustRemove: vi.fn(), trustList: vi.fn(),
};
const agent = {
  callSecurityAgent: vi.fn(), getSecurityAgentStatus: vi.fn(),
  invalidateSecurityAgentStatus: vi.fn(),
};
const accountSecurity = { listLocked: vi.fn(), unlock: vi.fn(), get: vi.fn() };
const memberRepo = { findMembership: vi.fn() };
const webObservation = { observation: vi.fn(), record: vi.fn() };
const webEnforcement = { touchAdminIp: vi.fn(), state: vi.fn() };
const webEnforcementRepo = { recentActions: vi.fn() };
stubModule(__dirname, '../../db/repos/platformSecurityRepo', securityRepo);
stubModule(__dirname, '../../lib/securityAgentClient', agent);
stubModule(__dirname, '../../db/repos/accountLoginSecurityRepo', accountSecurity);
stubModule(__dirname, '../../db/repos/memberRepo', memberRepo);
stubModule(__dirname, '../../lib/webSecurityObservation', webObservation);
stubModule(__dirname, '../../lib/webSecurityEnforcement', webEnforcement);
stubModule(__dirname, '../../db/repos/webSecurityEnforcementRepo', webEnforcementRepo);
stubModule(__dirname, '../../lib/passwordHasher', { verifyPassword: vi.fn(async () => true) });
stubModule(__dirname, '../../db/repos/userRepo', { findById: vi.fn(async id => ({ id, password_hash: 'hash' })) });
stubModule(__dirname, '../../db/repos/authIdentityRepo', { findByUser: vi.fn() });
stubModule(__dirname, '../../db/repos/notificationRepo', { getByUser: vi.fn(async () => null) });
stubModule(__dirname, '../../lib/telegram', { sendMessage: vi.fn() });
stubModule(__dirname, '../../lib/rateLimit', {
  clientIp: req => String(req.headers['x-test-ip'] || '203.0.113.10'),
  guardPolicy: () => (_req, _res, next) => next(),
  clearLoginIdentityBlocks: vi.fn(async () => 2),
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
    role: req.headers['x-test-role'] === 'owner' ? 'OWNER' : 'MEMBER',
    workspace_id: 'workspace-1',
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
    agent.getSecurityAgentStatus.mockImplementation(() => agent.callSecurityAgent('status'));
    accountSecurity.listLocked.mockResolvedValue([]);
    accountSecurity.unlock.mockResolvedValue(true);
    accountSecurity.get.mockResolvedValue({ last_failure_ip: '198.51.100.9' });
    memberRepo.findMembership.mockResolvedValue({ role: 'MEMBER' });
    webObservation.observation.mockResolvedValue({ mode: 'OBSERVE_ONLY', sources: [], events: [] });
    webObservation.record.mockResolvedValue(undefined);
    webEnforcement.touchAdminIp.mockResolvedValue(true);
    webEnforcement.state.mockReturnValue({ active: false, status: 'OBSERVE_ONLY' });
    webEnforcementRepo.recentActions.mockResolvedValue([]);
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

  it('traduce un timeout del agente a indisponibilidad temporal', async () => {
    agent.getSecurityAgentStatus.mockRejectedValue(Object.assign(new Error('timeout'), {
      code: 'SECURITY_AGENT_TIMEOUT',
    }));
    const response = await request(app).get('/api/admin/security/status').set('x-test-role', 'admin');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SECURITY_AGENT_TIMEOUT');
  });

  it('identifica un bloqueo indefinido originado por reincidencia web', async () => {
    agent.callSecurityAgent.mockResolvedValue({ jails: [{ name: 'gestionvpn-indefinite',
      banDetails: [{ target: '198.51.100.20', blockedSince: 100, expiresAt: null }] }], trusted: [] });
    webEnforcementRepo.recentActions.mockResolvedValue([{ source_ip: '198.51.100.20',
      jail: 'gestionvpn-indefinite', recommendation: 'INDEFINITE_WEB_RECIDIVISM', status: 'APPLIED' }]);
    const response = await request(app).get('/api/admin/security/status').set('x-test-role', 'admin');
    expect(response.status).toBe(200);
    expect(response.body.jails[0].banDetails[0]).toEqual(expect.objectContaining({
      reason: 'Reincidencia: 3 bloqueos web en 7 días', category: 'AUTOMATIC',
    }));
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

  it('convierte un bloqueo automático en indefinido con una sola operación auditada', async () => {
    agent.callSecurityAgent.mockResolvedValue({ target: mutation.target,
      sourceJail: 'sshd', jail: 'gestionvpn-indefinite' });
    const response = await request(app).post('/api/admin/security/make-indefinite')
      .set('x-test-role', 'admin').send({ ...mutation, jail: 'sshd', duration: 'indefinite',
        confirmIndefinite: true });
    expect(response.status).toBe(200);
    expect(agent.callSecurityAgent).toHaveBeenCalledWith('promote_indefinite', {
      target: mutation.target, sourceJail: 'sshd', jail: 'gestionvpn-indefinite',
      requestIp: '203.0.113.10',
    });
    expect(securityRepo.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PROMOTE_INDEFINITE', outcome: 'SUCCESS', jail: 'gestionvpn-indefinite',
    }));
  });
  it('lista y desbloquea cuentas con reautenticacion y auditoria', async () => {
    const userId = '00000000-0000-4000-8000-000000000099';
    accountSecurity.listLocked.mockResolvedValue([{ user_id: userId, email: 'cliente@example.com' }]);
    const list = await request(app).get('/api/admin/security/locked-accounts').set('x-test-role', 'admin');
    expect(list.status).toBe(200);
    expect(list.body.accounts).toHaveLength(1);

    const response = await request(app).post('/api/admin/security/locked-accounts/unlock')
      .set('x-test-role', 'admin').send({ userId, category: 'FALSE_POSITIVE',
        reason: 'El usuario olvido su contrasena', stepUpToken: 'x'.repeat(32) });
    expect(response.status).toBe(200);
    expect(accountSecurity.unlock).toHaveBeenCalledWith(userId);
    expect(webObservation.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ACCOUNT_RECOVERY', sourceIp: '198.51.100.9', userId,
      decision: 'ADMIN_ACCOUNT_UNLOCK',
    }));
    expect(securityRepo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_UNLOCK',
      detail: expect.objectContaining({ clearedRateLimits: 2, ipGloballyBlocked: false }) }));
  });
  it('permite al moderador desbloquear sólo una cuenta de su workspace', async () => {
    const userId = '00000000-0000-4000-8000-000000000098';
    accountSecurity.listLocked.mockResolvedValue([{ user_id: userId, email: 'miembro@example.com' }]);
    const list = await request(app).get('/api/admin/security/locked-accounts').set('x-test-role', 'owner');
    expect(list.status).toBe(200);
    expect(accountSecurity.listLocked).toHaveBeenCalledWith(expect.any(Number), 'workspace-1');
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();

    const response = await request(app).post('/api/admin/security/locked-accounts/unlock')
      .set('x-test-role', 'owner').send({ userId, category: 'FALSE_POSITIVE',
        reason: 'El miembro olvidó su contraseña', stepUpToken: 'x'.repeat(32) });
    expect(response.status).toBe(200);
    expect(memberRepo.findMembership).toHaveBeenCalledWith('workspace-1', userId);
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });

  it('impide al moderador desbloquear cuentas ajenas y operar el firewall', async () => {
    const userId = '00000000-0000-4000-8000-000000000097';
    memberRepo.findMembership.mockResolvedValue(null);
    const unlock = await request(app).post('/api/admin/security/locked-accounts/unlock')
      .set('x-test-role', 'owner').send({ userId, category: 'FALSE_POSITIVE',
        reason: 'Solicitud fuera del workspace', stepUpToken: 'x'.repeat(32) });
    expect(unlock.status).toBe(404);
    expect(accountSecurity.unlock).not.toHaveBeenCalled();

    const ban = await request(app).post('/api/admin/security/ban')
      .set('x-test-role', 'owner').send(mutation);
    expect(ban.status).toBe(403);
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });
  it('expone observacion web solo al administrador y no ejecuta bloqueos', async () => {
    const response = await request(app).get('/api/admin/security/web-observation').set('x-test-role', 'admin');
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('OBSERVE_ONLY');
    expect(response.body.enforcement).toEqual({ active: false, status: 'OBSERVE_ONLY' });
    expect(response.body.actions).toEqual([]);
    expect(webObservation.observation).toHaveBeenCalledWith({ sourceIp: null });
    expect(webEnforcement.touchAdminIp).toHaveBeenCalledWith({
      sourceIp: '203.0.113.10', userId: 'admin-1',
    });
    expect(agent.callSecurityAgent).not.toHaveBeenCalled();
  });
});
