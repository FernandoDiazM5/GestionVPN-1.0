// ============================================================
//  apMonitorSecurity.test.js — Fase 1 (seguridad) de la vista Monitor AP
//
//  Cubre los fixes:
//    C1 — enrich-batch exige apId + propiedad (ownsApUuid)
//    C2 — poll-direct usa la IP de la DB, nunca la del body (anti-SSRF)
//    C4 — credenciales SSH resueltas server-side (no llegan del body)
//
//  Estrategia: stub de db.service / ap.service / tenantScope / logger
//  vía require.cache, y montaje de Express con SOLO ap.routes.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');
const path = require('node:path');

// ── Stubs ANTES de require al router ────────────────────────────
const apServiceMocks = stubModule(__dirname, '../../ap.service', {
  pollAp: vi.fn().mockResolvedValue([]),
  getDetail: vi.fn().mockResolvedValue({ deviceName: 'CPE-X', deviceModel: 'LBE-5AC' }),
  getFullDetail: vi.fn().mockResolvedValue({}),
  clearApCache: vi.fn(),
});

// db mock: get/all/run configurables por test
const db = {
  get: vi.fn(),
  all: vi.fn().mockResolvedValue([]),
  run: vi.fn().mockResolvedValue(undefined),
};
const dbServiceMocks = stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  encryptPass: (s) => s,
  decryptPass: (s) => s,            // passthrough: el "cifrado" es el texto plano
  getApIntId: vi.fn().mockResolvedValue(7),
  getCpeIntId: vi.fn().mockResolvedValue(11),
  getApGroupIntId: vi.fn().mockResolvedValue(1),
  getNodeByPppUser: vi.fn(),
});

const tenantMocks = stubModule(__dirname, '../../lib/tenantScope', {
  reqWorkspace: () => 'ws-1',
  ownedGroupIntIds: vi.fn().mockResolvedValue(null),
  ownedApIntIds: vi.fn().mockResolvedValue(null),
  ownsGroupUuid: vi.fn().mockResolvedValue(true),
  ownsApUuid: vi.fn().mockResolvedValue(true),  // por defecto: dueño
  cpeForeign: vi.fn().mockResolvedValue(false),
});

stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const ROUTES_PATH = require.resolve(path.join(__dirname, '..', '..', 'ap.routes'));

// ── Build Express app con SOLO ap.routes ────────────────────────
const express = require('express');
const request = require('supertest');
const apRoutes = require('../../ap.routes');

const app = express();
app.use(express.json());
app.use('/api/ap-monitor', apRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  db.get.mockReset();
  db.all.mockResolvedValue([]);
  db.run.mockResolvedValue(undefined);
  apServiceMocks.pollAp.mockResolvedValue([]);
  apServiceMocks.getDetail.mockResolvedValue({ deviceName: 'CPE-X', deviceModel: 'LBE-5AC' });
  tenantMocks.ownsApUuid.mockResolvedValue(true);
  dbServiceMocks.getApIntId.mockResolvedValue(7);
});

afterAll(() => { delete require.cache[ROUTES_PATH]; });

describe('POST /poll-direct — aislamiento + anti-SSRF (C2/C4)', () => {
  it('sin apId → 400 y NO ejecuta SSH', async () => {
    const r = await request(app).post('/api/ap-monitor/poll-direct').send({ ip: '1.2.3.4' });
    expect(r.status).toBe(400);
    expect(apServiceMocks.pollAp).not.toHaveBeenCalled();
  });

  it('AP de otro workspace → 404 y NO ejecuta SSH', async () => {
    tenantMocks.ownsApUuid.mockResolvedValue(false);
    const r = await request(app).post('/api/ap-monitor/poll-direct').send({ apId: 'ajeno' });
    expect(r.status).toBe(404);
    expect(apServiceMocks.pollAp).not.toHaveBeenCalled();
  });

  it('usa la IP de la DB, NO la del body (anti-SSRF)', async () => {
    db.get.mockResolvedValue({
      ip: '10.0.0.5', usuario_ssh: 'ubnt', clave_ssh_enc: 'secret',
      puerto_ssh: 22, ap_group_id: 1, firmware: 'XW.v6',
    });
    const r = await request(app).post('/api/ap-monitor/poll-direct')
      .send({ apId: 'ap1', ip: '1.2.3.4', port: 9999, user: 'evil', pass: 'evil' });
    expect(r.status).toBe(200);
    expect(apServiceMocks.pollAp).toHaveBeenCalledTimes(1);
    const [, ipArg, portArg, userArg, passArg] = apServiceMocks.pollAp.mock.calls[0];
    expect(ipArg).toBe('10.0.0.5');     // ← IP de la DB
    expect(ipArg).not.toBe('1.2.3.4');  // ← ignora la del body
    expect(portArg).toBe(22);
    expect(userArg).toBe('ubnt');       // ← credenciales de la DB
    expect(passArg).toBe('secret');     // ← ignora user/pass del body
  });
});

describe('POST /cpes/enrich-batch — aislamiento (C1/C4)', () => {
  it('sin apId → 400 y NO ejecuta SSH', async () => {
    const r = await request(app).post('/api/ap-monitor/cpes/enrich-batch')
      .send({ cpes: [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.9' }] });
    expect(r.status).toBe(400);
    expect(apServiceMocks.getDetail).not.toHaveBeenCalled();
  });

  it('AP de otro workspace → 404 y NO ejecuta SSH ni resuelve credenciales', async () => {
    tenantMocks.ownsApUuid.mockResolvedValue(false);
    const r = await request(app).post('/api/ap-monitor/cpes/enrich-batch')
      .send({ apId: 'ajeno', cpes: [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.9' }], user: 'evil', pass: 'evil' });
    expect(r.status).toBe(404);
    expect(apServiceMocks.getDetail).not.toHaveBeenCalled();
  });

  it('AP propio sin credenciales en DB → 400 (no usa las del body)', async () => {
    db.get.mockResolvedValue({ usuario_ssh: '', clave_ssh_enc: '', puerto_ssh: 22 });
    const r = await request(app).post('/api/ap-monitor/cpes/enrich-batch')
      .send({ apId: 'ap1', cpes: [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.9' }], user: 'ubnt', pass: 'ubnt' });
    expect(r.status).toBe(400);
    expect(apServiceMocks.getDetail).not.toHaveBeenCalled();
  });

  it('AP propio con credenciales en DB → SSH con las credenciales de la DB', async () => {
    db.get.mockResolvedValue({ usuario_ssh: 'ubnt', clave_ssh_enc: 'secret', puerto_ssh: 22 });
    const r = await request(app).post('/api/ap-monitor/cpes/enrich-batch')
      .send({ apId: 'ap1', cpes: [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.9' }], user: 'evil', pass: 'evil' });
    expect(r.status).toBe(200);
    expect(apServiceMocks.getDetail).toHaveBeenCalledTimes(1);
    const [ipArg, portArg, userArg, passArg] = apServiceMocks.getDetail.mock.calls[0];
    expect(ipArg).toBe('10.0.0.9');
    expect(portArg).toBe(22);
    expect(userArg).toBe('ubnt');     // ← de la DB
    expect(passArg).toBe('secret');   // ← ignora user/pass del body
  });
});

describe('POST /poll-direct — C3: resuelve el nodo DUEÑO, no "el primero"', () => {
  // Dos nodos, ambos con credenciales. El AP no tiene credenciales propias.
  // El bug previo usaba el primer node_ssh_creds (NODO-A); ahora debe resolver
  // el nodo que posee el AP (NODO-B) por nombre_nodo o por subred.
  const twoNodesWithCreds = (sql, params) => {
    if (/FROM nodes/.test(sql)) {
      return Promise.resolve([
        { id: 1, nombre_nodo: 'NODO-A', segmento_lan: '10.0.10.0/24' },
        { id: 2, nombre_nodo: 'NODO-B', segmento_lan: '10.0.50.0/24' },
      ]);
    }
    if (/node_ssh_creds/.test(sql)) {
      const nodeId = params && params[0];
      if (nodeId === 1) return Promise.resolve([{ ssh_user: 'admin-a', ssh_pass_enc: 'pass-a', ssh_port: 22 }]);
      if (nodeId === 2) return Promise.resolve([{ ssh_user: 'admin-b', ssh_pass_enc: 'pass-b', ssh_port: 22 }]);
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };

  it('resuelve por nombre_nodo (NODO-B), no las credenciales del primer nodo', async () => {
    db.get.mockResolvedValue({ ip: '10.0.50.7', usuario_ssh: '', clave_ssh_enc: '', puerto_ssh: 22, nombre_nodo: 'NODO-B', firmware: '' });
    db.all.mockImplementation(twoNodesWithCreds);
    const r = await request(app).post('/api/ap-monitor/poll-direct').send({ apId: 'ap1' });
    expect(r.status).toBe(200);
    const [, , , userArg, passArg] = apServiceMocks.pollAp.mock.calls[0];
    expect(userArg).toBe('admin-b');   // ← nodo dueño
    expect(passArg).toBe('pass-b');
    expect(userArg).not.toBe('admin-a');
  });

  it('resuelve por subred (CIDR) cuando nombre_nodo no coincide', async () => {
    db.get.mockResolvedValue({ ip: '10.0.50.7', usuario_ssh: '', clave_ssh_enc: '', puerto_ssh: 22, nombre_nodo: '', firmware: '' });
    db.all.mockImplementation(twoNodesWithCreds);
    const r = await request(app).post('/api/ap-monitor/poll-direct').send({ apId: 'ap1' });
    expect(r.status).toBe(200);
    const [, , , userArg] = apServiceMocks.pollAp.mock.calls[0];
    expect(userArg).toBe('admin-b');   // ← 10.0.50.7 ∈ 10.0.50.0/24 (NODO-B)
  });

  it('B: usa node_id persistido directo (ignora nombre_nodo/IP que apuntarían a otro)', async () => {
    // node_id = 2 aunque nombre_nodo/IP coincidirían con NODO-A: gana el FK.
    db.get.mockResolvedValue({ ip: '10.0.10.7', usuario_ssh: '', clave_ssh_enc: '', puerto_ssh: 22, nombre_nodo: 'NODO-A', node_id: 2, firmware: '' });
    db.all.mockImplementation(twoNodesWithCreds);
    const r = await request(app).post('/api/ap-monitor/poll-direct').send({ apId: 'ap1' });
    expect(r.status).toBe(200);
    const [, , , userArg] = apServiceMocks.pollAp.mock.calls[0];
    expect(userArg).toBe('admin-b');   // ← node_id=2 (NODO-B), no NODO-A
  });
});
