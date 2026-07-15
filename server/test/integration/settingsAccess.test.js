// ============================================================
//  A2 — /settings/save debe exigir platform_admin (no el rol legacy 'admin').
//  Regresión: mapRbacRole otorga 'admin' legacy a OWNER → antes un moderador
//  podía mutar settings GLOBALES (scan_mode, server_public_ip).
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const db = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
const getAppSetting = vi.fn();
const sendGeneric = vi.fn();
stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  encryptPass: vi.fn((v) => `enc:${v}`),
  getAppSetting,
});
stubModule(__dirname, '../../lib/mailer', { sendGeneric });
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const express = require('express');
const request = require('supertest');
const settingsRoutes = require('../../routes/settings.routes');
const { errorMiddleware } = require('../../lib/apiResponse');

// El OWNER lleva user.role='admin' (legacy mapRbacRole) PERO platform_admin=false
// → el gate correcto es platform_admin.
const IDENTITIES = {
  member:        { user: { id: 'u-m', role: 'viewer' }, account: { sub: 'u-m', workspace_id: 'ws-1', role: 'MEMBER', platform_admin: false } },
  owner:         { user: { id: 'u-o', role: 'admin' },  account: { sub: 'u-o', workspace_id: 'ws-1', role: 'OWNER', platform_admin: false } },
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
  getAppSetting.mockResolvedValue('');
  sendGeneric.mockResolvedValue({ delivered: true });
});

describe('A2 — escritura de settings solo para platform_admin', () => {
  for (const id of ['owner', 'member']) {
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
      { key: 'error_report_email', value: 'errores@example.com' },
    ]);
    const r = await request(app).get('/api/settings/get').set('x-test-identity', 'owner');
    expect(r.status).toBe(200);
    expect(r.body.settings.server_public_ip).toBe('1.2.3.4');
    expect(r.body.settings.MT_PASS).toBeUndefined(); // claves core ocultas a no-admin
    expect(r.body.settings.error_report_email).toBeUndefined();
  });

  it('valida y normaliza el correo de reportes', async () => {
    const valid = await request(app).post('/api/settings/save')
      .set('x-test-identity', 'platformAdmin')
      .send({ key: 'error_report_email', value: ' ALERTAS@Example.COM ' });
    expect(valid.status).toBe(200);
    expect(db.run).toHaveBeenCalledWith(expect.any(String), [
      'error_report_email', 'alertas@example.com', expect.any(Number),
    ]);

    db.run.mockClear();
    const invalid = await request(app).post('/api/settings/save')
      .set('x-test-identity', 'platformAdmin')
      .send({ key: 'error_report_email', value: 'correo-invalido' });
    expect(invalid.status).toBe(422);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('cifra la contraseña de respaldo y nunca persiste la máscara', async () => {
    const saved = await request(app).post('/api/settings/save')
      .set('x-test-identity', 'platformAdmin')
      .send({ key: 'core_backup_password', value: 'una-clave-segura-2026' });
    expect(saved.status).toBe(200);
    expect(db.run).toHaveBeenCalledWith(expect.any(String), [
      'core_backup_password', 'enc:una-clave-segura-2026', expect.any(Number),
    ]);

    db.run.mockClear();
    const masked = await request(app).post('/api/settings/save')
      .set('x-test-identity', 'platformAdmin')
      .send({ key: 'core_backup_password', value: '********' });
    expect(masked.status).toBe(200);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('envia una prueba solo al destinatario configurado', async () => {
    getAppSetting.mockResolvedValue('alertas@example.com');
    const r = await request(app).post('/api/settings/test-error-email')
      .set('x-test-identity', 'platformAdmin');
    expect(r.status).toBe(200);
    expect(sendGeneric).toHaveBeenCalledWith(expect.objectContaining({
      to: 'alertas@example.com', kind: 'error_report_test',
    }));
  });
});
