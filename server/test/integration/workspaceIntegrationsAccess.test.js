import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const service = { list: vi.fn(), save: vi.fn(), remove: vi.fn(), revalidate: vi.fn(), getMikrowispClient: vi.fn() };
stubModule(__dirname, '../../lib/workspaceIntegrationService', service);
const catalogs = { listTypes: vi.fn(), list: vi.fn(), sync: vi.fn() };
stubModule(__dirname, '../../lib/externalCatalogService', catalogs);
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
  service.getMikrowispClient.mockResolvedValue({ id: '14', name: 'Ana' });
  catalogs.listTypes.mockResolvedValue([{ type: 'ROUTERS', label: 'Routers y nodos', count: 0, lastSyncedAt: null }]);
  catalogs.sync.mockResolvedValue({ type: 'ROUTERS', label: 'Routers y nodos', entries: [] });
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

  it('consulta MikroWisp por ID y workspace sólo para OWNER', async () => {
    expect((await request(app).get('/api/workspace/integrations/mikrowisp/clients/14').set('x-role', 'MEMBER')).status).toBe(403);
    const response = await request(app).get('/api/workspace/integrations/mikrowisp/clients/0014').set('x-role', 'OWNER');
    expect(response.status).toBe(200);
    expect(service.getMikrowispClient).toHaveBeenCalledWith('ws-1', '0014');
    expect(response.body.client).toEqual({ id: '14', name: 'Ana' });
  });

  it('lista y sincroniza catálogos sólo para OWNER y tipos permitidos', async () => {
    expect((await request(app).post('/api/workspace/integrations/mikrowisp/catalogs/ROUTERS/sync').set('x-role', 'MEMBER').send({})).status).toBe(403);
    const response = await request(app).post('/api/workspace/integrations/mikrowisp/catalogs/ROUTERS/sync').set('x-role', 'OWNER').send({});
    expect(response.status).toBe(200);
    expect(catalogs.sync).toHaveBeenCalledWith('ws-1', 'ROUTERS');
    expect((await request(app).post('/api/workspace/integrations/mikrowisp/catalogs/PLANES/sync').set('x-role', 'OWNER').send({})).status).toBe(400);
    expect((await request(app).post('/api/workspace/integrations/mikrowisp/catalogs/ROUTERS/sync').set('x-role', 'OWNER').send({ extra: true })).status).toBe(400);
  });
});
