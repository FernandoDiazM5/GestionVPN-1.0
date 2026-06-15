// ============================================================
//  deviceSecurity.test.js — H14 Fase 1: anti-SSRF + creds server-side
//  en los endpoints de Escanear/NetworkDevices.
//
//  Cubre:
//   - /device/antenna con deviceId → resuelve IP+cred del AP propio (DB),
//     ignora la IP/credencial del body (anti-SSRF + no usa caché cliente).
//   - /device/antenna con deviceId ajeno → 404.
//   - /device/antenna sin deviceId (escaneo) → exige IP en subred propia.
//   - /device/auto-login → exige IP en subred propia.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const sshExec = vi.fn().mockResolvedValue('OUTPUT');
const trySshCredentials = vi.fn().mockResolvedValue({ user: 'ubnt', pass: 'p', port: 22, stats: {} });
stubModule(__dirname, '../../ubiquiti.service', {
  sshExec,
  trySshCredentials,
  parseFullOutput: () => ({ ok: true }),
  ANTENNA_CMD: 'cmd',
  IPV4_REGEX: /^(\d{1,3}\.){3}\d{1,3}$/,
  CIDR_REGEX: /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/,
  getSubnetHosts: () => [],
});

stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn(),
  safeWrite: vi.fn(),
  getErrorMessage: (e) => (e && e.message) || 'err',
});

const db = { get: vi.fn(), all: vi.fn().mockResolvedValue([]), run: vi.fn() };
stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  encryptPass: (s) => s,
  decryptPass: (s) => s,           // passthrough
  getApGroupIntId: vi.fn(),
});
stubModule(__dirname, '../../lib/apNode', { resolveOwnerNodeId: vi.fn() });
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const express = require('express');
const request = require('supertest');
const deviceRoutes = require('../../routes/device.routes');
const { errorMiddleware } = require('../../lib/apiResponse');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: 'u-o', role: 'admin' };
  req.account = { sub: 'u-o', workspace_id: 'ws-1', role: 'OWNER', platform_admin: false };
  next();
});
app.use('/api', deviceRoutes);
app.use(errorMiddleware);

// db.get: ownsApUuid (JOIN ap_groups) y el SELECT del AP. db.all: subredes propias.
beforeEach(() => {
  vi.clearAllMocks();
  sshExec.mockResolvedValue('OUTPUT');
  trySshCredentials.mockResolvedValue({ user: 'ubnt', pass: 'p', port: 22, stats: {} });
  db.get.mockImplementation((sql, params) => {
    if (/FROM aps a JOIN ap_groups/.test(sql)) {
      const uuid = params[0];
      if (uuid === 'own-ap') return Promise.resolve({ w: 'ws-1' });
      if (uuid === 'foreign-ap') return Promise.resolve({ w: 'ws-2' });
      return Promise.resolve(null);
    }
    if (/SELECT ip, usuario_ssh, clave_ssh_enc, puerto_ssh FROM aps WHERE uuid/.test(sql)) {
      return Promise.resolve({ ip: '10.0.50.7', usuario_ssh: 'ubnt', clave_ssh_enc: 'secret', puerto_ssh: 22 });
    }
    return Promise.resolve(null);
  });
  db.all.mockImplementation((sql) => {
    if (/FROM nodes WHERE workspace_id/.test(sql)) {
      return Promise.resolve([{ segmento_lan: '10.0.50.0/24', lan_subnets: '[]' }]);
    }
    return Promise.resolve([]);
  });
});

describe('POST /device/antenna — device guardado (deviceId)', () => {
  it('resuelve IP+cred SERVER-SIDE e ignora la IP/cred del body', async () => {
    const r = await request(app).post('/api/device/antenna')
      .send({ deviceId: 'own-ap', deviceIP: '1.2.3.4', deviceUser: 'evil', devicePass: 'evil' });
    expect(r.status).toBe(200);
    expect(sshExec).toHaveBeenCalledTimes(1);
    const [ipArg, , userArg, passArg] = sshExec.mock.calls[0];
    expect(ipArg).toBe('10.0.50.7');   // ← IP de la DB, NO la del body
    expect(ipArg).not.toBe('1.2.3.4');
    expect(userArg).toBe('ubnt');
    expect(passArg).toBe('secret');    // ← cred descifrada de la DB, NO 'evil'
  });

  it('AP de otro workspace → 404 y NO ejecuta SSH', async () => {
    const r = await request(app).post('/api/device/antenna')
      .send({ deviceId: 'foreign-ap', deviceIP: '10.0.50.7', deviceUser: 'x', devicePass: 'y' });
    expect(r.status).toBe(404);
    expect(sshExec).not.toHaveBeenCalled();
  });
});

describe('POST /device/antenna — escaneo (sin deviceId)', () => {
  it('IP en subred propia → usa cred del body y ejecuta SSH', async () => {
    const r = await request(app).post('/api/device/antenna')
      .send({ deviceIP: '10.0.50.20', deviceUser: 'ubnt', devicePass: 'scanpass' });
    expect(r.status).toBe(200);
    expect(sshExec).toHaveBeenCalledTimes(1);
    const [ipArg, , , passArg] = sshExec.mock.calls[0];
    expect(ipArg).toBe('10.0.50.20');
    expect(passArg).toBe('scanpass');
  });

  it('IP fuera de toda subred propia → 403 (anti-SSRF) y NO ejecuta SSH', async () => {
    const r = await request(app).post('/api/device/antenna')
      .send({ deviceIP: '8.8.8.8', deviceUser: 'x', devicePass: 'y' });
    expect(r.status).toBe(403);
    expect(sshExec).not.toHaveBeenCalled();
  });
});

describe('POST /device/auto-login — anti-SSRF', () => {
  it('IP fuera de subred propia → 403 y NO prueba credenciales', async () => {
    const r = await request(app).post('/api/device/auto-login')
      .send({ ip: '8.8.8.8', sshCredentials: [{ user: 'ubnt', pass: 'x' }] });
    expect(r.status).toBe(403);
    expect(trySshCredentials).not.toHaveBeenCalled();
  });

  it('IP en subred propia → prueba credenciales', async () => {
    const r = await request(app).post('/api/device/auto-login')
      .send({ ip: '10.0.50.7', sshCredentials: [{ user: 'ubnt', pass: 'x' }] });
    expect(r.status).toBe(200);
    expect(trySshCredentials).toHaveBeenCalledTimes(1);
  });
});
