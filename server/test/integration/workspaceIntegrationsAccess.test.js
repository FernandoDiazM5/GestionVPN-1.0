import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const service = { list: vi.fn(), save: vi.fn(), remove: vi.fn(), revalidate: vi.fn() };
stubModule(__dirname, '../../lib/workspaceIntegrationService', service);
stubModule(__dirname, '../../middleware/authJwt', {
  requireSession: (req, res, next) => req.account ? next() : res.status(401).json({ success: false }),
  requireRole: (...roles) => (req, res, next) => roles.includes(req.account?.role) ? next() : res.status(403).json({ success: false }),
});

const express = require('express');
const request = require('supertest');
const routes = require('../../routes/integrations.routes');
const app = express();
app.use(express.json());
app.use((req, _res, next) => { const role = req.headers['x-role']; if (role) req.account = { sub: 'u-1', workspace_id: 'ws-1', role }; next(); });
app.use('/api/workspace/integrations', routes);

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockResolvedValue([{ provider: 'TELEGRAM', configured: true, active: true, status: 'ACTIVE', label: '@bot' }]);
  service.save.mockResolvedValue({ provider: 'GEMINI', configured: true, active: true, status: 'ACTIVE', label: 'gemini' });
});

describe('integraciones por workspace', () => {
  it('solo OWNER puede consultar o modificar', async () => {
    expect((await request(app).get('/api/workspace/integrations').set('x-role', 'MEMBER')).status).toBe(403);
    expect((await request(app).put('/api/workspace/integrations/GEMINI').set('x-role', 'MEMBER').send({ apiKey: 'secret' })).status).toBe(403);
    expect(service.save).not.toHaveBeenCalled();
  });

  it('OWNER queda aislado al workspace de su sesión', async () => {
    const response = await request(app).put('/api/workspace/integrations/GEMINI').set('x-role', 'OWNER').send({ apiKey: 'secret' });
    expect(response.status).toBe(200);
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1', userId: 'u-1', provider: 'GEMINI' }));
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});

