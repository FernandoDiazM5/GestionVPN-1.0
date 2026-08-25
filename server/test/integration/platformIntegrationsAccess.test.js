import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const service = { list: vi.fn(), save: vi.fn(), remove: vi.fn(), revalidate: vi.fn() };
stubModule(__dirname, '../../lib/platformIntegrationService', service);
stubModule(__dirname, '../../lib/telegramBot', { start: vi.fn(), stop: vi.fn() });
stubModule(__dirname, '../../middleware/authJwt', {
  requireSession: (req, res, next) => req.account ? next() : res.status(401).json({ success: false }),
  requirePlatformAdmin: (req, res, next) => req.account?.platform_admin ? next() : res.status(403).json({ success: false }),
});

const express = require('express');
const request = require('supertest');
const routes = require('../../routes/platformIntegrations.routes');
const app = express();
app.use(express.json());
app.use((req, _res, next) => { if (req.headers['x-user']) req.account = { sub: 'u-1', platform_admin: req.headers['x-admin'] === 'true' }; next(); });
app.use('/api/admin/integrations', routes);

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockResolvedValue([]);
  service.save.mockResolvedValue({ provider: 'BREVO', configured: true, active: true, status: 'ACTIVE', label: 'admin@example.com' });
});

describe('integraciones globales de plataforma', () => {
  it('rechaza sesiones que no son administrador de plataforma', async () => {
    expect((await request(app).get('/api/admin/integrations').set('x-user', 'yes')).status).toBe(403);
    expect((await request(app).put('/api/admin/integrations/BREVO').set('x-user', 'yes').send({ password: 'secret' })).status).toBe(403);
    expect(service.save).not.toHaveBeenCalled();
  });

  it('permite al administrador guardar sin devolver el secreto', async () => {
    const response = await request(app).put('/api/admin/integrations/BREVO').set('x-user', 'yes').set('x-admin', 'true').send({ password: 'secret' });
    expect(response.status).toBe(200);
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', provider: 'BREVO' }));
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
