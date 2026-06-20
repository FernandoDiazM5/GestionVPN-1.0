// ============================================================
//  A2 — /settings/save debe exigir platform_admin (no el rol legacy 'admin').
//  Regresión: mapRbacRole otorga 'admin' legacy a OWNER/CO_MODERATOR → antes
//  un moderador podía mutar settings GLOBALES (scan_mode, server_public_ip).
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const db = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  encryptPass: vi.fn((v) => `enc:${v}`),
});
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const express = require('express');
const request = require('supertest');
const settingsRoutes = require('../../routes/settings.routes');
const { errorMiddleware } = require('../../lib/apiResponse');

// OWNER y CO_MODERATOR llevan user.role='admin' (legacy mapRbacRole) PERO
// platform_admin=false → el gate correcto es platform_admin.
const IDENTITIES = {
  member:        { user: { id: 'u-m', role: 'viewer' }, account: { sub: 'u-m', workspace_id: 'ws-1', role: 'MEMBER', platform_admin: false } },
  owner:         { user: { id: 'u-o', role: 'admin' },  account: { sub: 'u-o', workspace_id: 'ws-1', role: 'OWNER', platform_admin: false } },
  coMod:         { user: { id: 'u-c', role: 'admin' },  account: { sub: 'u-c', workspace_id: 'ws-1', role: 'CO_MODERATOR', platform_admin: false } },
  platformAdmin: { user: { id: 'u-a', role: 'admin' },  account: { sub: 'u-a', workspace_id: 'ws-0', role: 'OWNER', platform_admin: true } },
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const id = IDENTITIES[req.headers['x-test-identity']];
  if (id) { req.user = id.user; req.account = id.account; }
  next();
});
app.use('/api', settingsRoutes);
app.use(errorMiddleware);

beforeEach(() => {
  vi.clearAllMocks();
  db.get.mockResolvedValue(null);
  db.all.mockResolvedValue([]);
  db.run.mockResolvedValue(undefined);
});

describe('A2 — escritura de settings solo para platform_admin', () => {
  for (const id of ['owner', 'coMod', 'member']) {
    it(`${id} (no platform_admin) → 403 al guardar scan_mode (y no toca BD)`, async () => {
      const r = await request(app).post('/api/settings/save')
        .set('x-test-identity', id)
        .send({ key: 'scan_mode', value: 'local' });
      expect(r.status).toBe(403);
      expect(db.run).not.toHaveBeenCalled();
    });
  }

  it('sin identidad → 403', async () => {
    const r = await request(app).post('/api/settings/save').send({ key: 'scan_mode', value: 'local' });
    expect(r.status).toBe(403);
  });

  it('platform_admin → 200 y persiste', async () => {
    const r = await request(app).post('/api/settings/save')
      .set('x-test-identity', 'platformAdmin')
      .send({ key: 'scan_mode', value: 'local' });
    expect(r.status).toBe(200);
    expect(db.run).toHaveBeenCalled();
  });

  it('GET /settings/get sigue accesible a un moderador (lectura, sin claves core)', async () => {
    db.all.mockResolvedValue([
      { key: 'server_public_ip', value: '1.2.3.4' },
      { key: 'MT_PASS', value: 'secret' },
    ]);
    const r = await request(app).get('/api/settings/get').set('x-test-identity', 'owner');
    expect(r.status).toBe(200);
    expect(r.body.settings.server_public_ip).toBe('1.2.3.4');
    expect(r.body.settings.MT_PASS).toBeUndefined(); // claves core ocultas a no-admin
  });
});
