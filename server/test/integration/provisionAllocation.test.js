// ============================================================
//  provisionAllocation.test.js — robustez de /node/provision
//
//  Cubre:
//   H3 — Asignación AUTORITATIVA: el ND y la IP remota se recalculan desde el
//        estado vivo del router al provisionar; si el valor del cliente colisiona
//        (preview obsoleto / alta en paralelo) se reasigna el siguiente libre.
//   H6 — Validación server-side del nombre del nodo (evita VRF-ND…- sin nombre).
//
//  Estrategia: stub de routeros.service / db.service / logger / repos vía
//  require.cache; req.mikrotik + identidad inyectados por middleware.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

// safeWrite devuelve datos canónicos por comando; el resto de escrituras se
// capturan en writeIdempotent para assertion.
let vrfPrint = [];
let secretPrint = [];
const writeIdempotent = vi.fn().mockResolvedValue(undefined);

const safeWrite = vi.fn(async (_api, cmd) => {
  const c = cmd[0];
  if (c === '/ip/vrf/print') return vrfPrint;
  if (c === '/ppp/secret/print') return secretPrint;
  return [];
});

stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }),
  safeWrite,
  writeIdempotent,
  getErrorMessage: (e) => (e && e.message) || 'err',
  parseHandshakeSecs: () => 0,
});

const db = {
  get: vi.fn().mockResolvedValue(null),
  all: vi.fn().mockResolvedValue([]),
  run: vi.fn().mockResolvedValue(undefined),
};
stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  saveNode: vi.fn().mockResolvedValue(undefined),
  deleteNode: vi.fn().mockResolvedValue({ deviceIds: [] }),
  encryptPass: (s) => s,
  decryptPass: (s) => s,
  getNodeId: vi.fn().mockResolvedValue(1),
  getNodes: vi.fn().mockResolvedValue([]),
});
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});
stubModule(__dirname, '../../db/repos/assignmentRepo', { assignedTunnelIds: vi.fn().mockResolvedValue([]) });
stubModule(__dirname, '../../db/repos/sessionRepo', {
  activeMapForWorkspace: vi.fn().mockResolvedValue(new Map()),
  getActiveByUser: vi.fn().mockResolvedValue(null),
});

const express = require('express');
const request = require('supertest');
const provisionRoutes = require('../../routes/nodes/provision.routes');
const { errorMiddleware } = require('../../lib/apiResponse');
const { connectToMikrotik } = require('../../routeros.service');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: 'u-o', username: 'owner', role: 'admin' };
  req.account = { sub: 'u-o', workspace_id: 'ws-1', role: 'OWNER', platform_admin: false };
  req.mikrotik = { ip: '1.1.1.1', user: 'admin', pass: 'x' };
  next();
});
app.use('/api', provisionRoutes);
app.use(errorMiddleware);

const baseSstp = {
  nodeName: 'TEST', protocol: 'sstp',
  pppUser: 'ppp-test', pppPassword: 'secret123',
  lanSubnets: ['10.3.0.0/24'],
};

// Extrae los args de la llamada writeIdempotent cuyo cmd[0] === objeto buscado.
const callFor = (obj) =>
  writeIdempotent.mock.calls.find(([, args]) => Array.isArray(args) && args[0] === obj)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  vrfPrint = [];
  secretPrint = [];
  db.run.mockResolvedValue(undefined);
});

describe('H3 — el ND se recalcula si el valor del cliente colisiona', () => {
  it('cliente manda ND15 pero VRF-ND15 ya existe → provisiona ND16', async () => {
    vrfPrint = [{ name: 'VRF-ND15-OTHER', '.id': '*1', interfaces: 'VPN-SSTP-ND15-OTHER' }];
    const r = await request(app).post('/api/node/provision')
      .send({ ...baseSstp, nodeNumber: 15, remoteAddress: '10.10.250.205' });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/ND16/);
    expect(r.body.vrfName).toBe('VRF-ND16-TEST');
    // El VRF creado debe ser el autoritativo, no el del cliente.
    expect(callFor('/ip/vrf/add')).toEqual(
      expect.arrayContaining(['=name=VRF-ND16-TEST'])
    );
  });

  it('cliente manda ND libre → se respeta (preview fiel)', async () => {
    vrfPrint = [{ name: 'VRF-ND3-OTHER', '.id': '*1', interfaces: 'x' }];
    const r = await request(app).post('/api/node/provision')
      .send({ ...baseSstp, nodeNumber: 4, remoteAddress: '10.10.250.205' });
    expect(r.status).toBe(200);
    expect(r.body.vrfName).toBe('VRF-ND4-TEST');
  });

  it('IP remota del cliente ya usada → reasigna la siguiente libre', async () => {
    secretPrint = [{ name: 'x', 'remote-address': '10.10.250.205' }];
    const r = await request(app).post('/api/node/provision')
      .send({ ...baseSstp, nodeNumber: 1, remoteAddress: '10.10.250.205' });
    expect(r.status).toBe(200);
    // 205 ocupada → nextRemote = max(205)+1 = 206
    expect(r.body.remoteAddress).toBe('10.10.250.206');
    expect(callFor('/ppp/secret/add')).toEqual(
      expect.arrayContaining(['=remote-address=10.10.250.206'])
    );
  });
});

describe('H4 — rollback best-effort si la provisión falla a mitad', () => {
  it('falla al crear la interfaz SSTP → elimina el PPP secret ya creado', async () => {
    // Estado vivo: el secret "ya existe" (lo creó el paso 1 antes del fallo).
    secretPrint = [{ name: 'ppp-test', '.id': '*SEC', 'remote-address': '10.10.250.250' }];
    // El paso 2 (sstp-server/add) revienta → dispara el catch + rollback.
    writeIdempotent.mockImplementation(async (_api, cmd) => {
      if (cmd[0] === '/interface/sstp-server/add') throw new Error('boom');
      return undefined;
    });

    const r = await request(app).post('/api/node/provision')
      .send({ ...baseSstp, nodeNumber: 1, remoteAddress: '10.10.250.205' });

    expect(r.status).toBe(500);
    expect(r.body.rolledBack).toBe(true);
    // El rollback debe haber emitido el remove del PPP secret creado.
    const removedSecret = safeWrite.mock.calls.some(([, args]) =>
      Array.isArray(args) && args[0] === '/ppp/secret/remove' && args[1] === '=.id=*SEC');
    expect(removedSecret).toBe(true);
  });

  it('NO elimina el VRF si falló antes de crearlo (vrfCreatedByUs=false)', async () => {
    secretPrint = [{ name: 'ppp-test', '.id': '*SEC' }];
    writeIdempotent.mockImplementation(async (_api, cmd) => {
      if (cmd[0] === '/interface/sstp-server/add') throw new Error('boom');
      return undefined;
    });
    await request(app).post('/api/node/provision')
      .send({ ...baseSstp, nodeNumber: 1, remoteAddress: '10.10.250.205' });

    const touchedVrf = safeWrite.mock.calls.some(([, args]) =>
      Array.isArray(args) && args[0] === '/ip/vrf/remove');
    expect(touchedVrf).toBe(false);
  });
});

describe('H6 — validación de nombre antes de tocar el router', () => {
  it('nombre vacío → 400 y NO conecta al router', async () => {
    const r = await request(app).post('/api/node/provision')
      .send({ ...baseSstp, nodeName: '   ', nodeNumber: 1, remoteAddress: '10.10.250.205' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(connectToMikrotik).not.toHaveBeenCalled();
  });
});
