// ============================================================
//  nodesAccessControl.test.js — RBAC en las rutas de "Nodos"
//
//  Cubre el fix H1 (broken access control): las rutas de MUTACIÓN de
//  nodos solo tenían `verifyToken`, por lo que un MEMBER (viewer) podía
//  crear/editar/eliminar nodos vía API directa (la UI las ocultaba pero
//  el backend no lo reforzaba). Ahora las MUTACIONES exigen `requireOperator`.
//  Excepción: /node/history/add (append-only) se gatea por WORKSPACE, no por
//  rol — un MEMBER registra eventos de sus nodos asignados.
//
//  Cubre también el fix H5: GET /node/tags se filtra por workspace.
//
//  Estrategia (igual que apMonitorSecurity.test.js): stub de db.service,
//  logger y repos vía require.cache; inyector de identidad por header.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

// ── DB mock ──────────────────────────────────────────────────────
const db = {
  get: vi.fn().mockResolvedValue(null),
  all: vi.fn().mockResolvedValue([]),
  run: vi.fn().mockResolvedValue(undefined),
};
stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  getNodeId: vi.fn().mockResolvedValue(1),
  getNodes: vi.fn().mockResolvedValue([]),
  getNodeByPppUser: vi.fn().mockResolvedValue(null),
  saveNode: vi.fn().mockResolvedValue(undefined),
  updateNodeFields: vi.fn().mockResolvedValue(undefined),
  deleteNode: vi.fn().mockResolvedValue({ deviceIds: [] }),
  encryptPass: (s) => s,
  decryptPass: (s) => s,
});

stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const assignmentRepoMocks = {
  assignedTunnelIds: vi.fn().mockResolvedValue([]),
};
stubModule(__dirname, '../../db/repos/assignmentRepo', assignmentRepoMocks);
stubModule(__dirname, '../../db/repos/sessionRepo', {
  activeMapForWorkspace: vi.fn().mockResolvedValue(new Map()),
  getActiveByUser: vi.fn().mockResolvedValue(null),
});
stubModule(__dirname, '../../lib/tunnelProvisioner', {
  LEGACY_GLOBAL_COMMENTS: [],
  removeMangleIds: vi.fn(),
  addUserMangle: vi.fn(),
  mangleComment: (id) => `ACCESO-USER-${id}`,
});

// ── App con los routers reales + inyector de identidad ───────────
const express = require('express');
const request = require('supertest');
const nodeRoutes = require('../../routes/nodes');
const tunnelRepairRoutes = require('../../routes/core/tunnel-repair.routes');

// Identidades de prueba — M2: requireOperator y el scoping miran req.account
// (RBAC: platform_admin / role / workspace_id). req.user queda como compat legacy.
const IDENTITIES = {
  viewer: {
    user: { id: 'u-m', username: 'member', role: 'viewer' },
    account: { sub: 'u-m', workspace_id: 'ws-1', role: 'MEMBER', platform_admin: false },
  },
  owner: {
    user: { id: 'u-o', username: 'owner', role: 'admin' },
    account: { sub: 'u-o', workspace_id: 'ws-1', role: 'OWNER', platform_admin: false },
  },
  platformAdmin: {
    user: { id: 'u-a', username: 'admin', role: 'admin' },
    account: { sub: 'u-a', workspace_id: 'ws-0', role: 'OWNER', platform_admin: true },
  },
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const id = IDENTITIES[req.headers['x-test-identity']];
  if (id) { req.user = id.user; req.account = id.account; }
  next();
});
app.use('/api', nodeRoutes);
app.use('/api', tunnelRepairRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  db.get.mockResolvedValue(null);
  db.all.mockResolvedValue([]);
  db.run.mockResolvedValue(undefined);
  assignmentRepoMocks.assignedTunnelIds.mockResolvedValue(['X']);
});

const SENSITIVE_MANAGER_ROUTES = [
  { path: '/api/node/creds/get', body: { pppUser: 'X' } },
  { path: '/api/node/ssh-creds/get', body: { pppUser: 'X' } },
  { path: '/api/node/details', body: { pppUser: 'X', vrfName: 'VRF-ND2-X' } },
  { path: '/api/node/script', body: { pppUser: 'X', serverPublicIP: 'vpn.example.test' } },
];

describe('Auditoría — datos sensibles de nodos requieren moderador y ownership', () => {
  for (const route of SENSITIVE_MANAGER_ROUTES) {
    it(`POST ${route.path} → 403 para MEMBER`, async () => {
      const r = await request(app).post(route.path)
        .set('x-test-identity', 'viewer')
        .send(route.body);
      expect(r.status).toBe(403);
      expect(db.run).not.toHaveBeenCalled();
    });

    it(`POST ${route.path} → 404 para OWNER de otro workspace`, async () => {
      db.get.mockResolvedValue(null);
      const r = await request(app).post(route.path)
        .set('x-test-identity', 'owner')
        .send(route.body);
      expect(r.status).toBe(404);
    });
  }
});

describe('Auditoría — historial de nodo exige asignación para MEMBER', () => {
  it('MEMBER sin asignación → 404 y no lee historial', async () => {
    db.get.mockResolvedValueOnce({ ppp_user: 'X', nombre_vrf: 'VRF-ND2-X', workspace_id: 'ws-1' });
    assignmentRepoMocks.assignedTunnelIds.mockResolvedValue([]);
    const r = await request(app).post('/api/node/history/get')
      .set('x-test-identity', 'viewer')
      .send({ pppUser: 'X' });
    expect(r.status).toBe(404);
    expect(db.all).not.toHaveBeenCalled();
  });

  it('MEMBER con asignación → puede leer su historial', async () => {
    db.get
      .mockResolvedValueOnce({ ppp_user: 'X', nombre_vrf: 'VRF-ND2-X', workspace_id: 'ws-1' })
      .mockResolvedValueOnce(1);
    assignmentRepoMocks.assignedTunnelIds.mockResolvedValue(['VRF-ND2-X']);
    db.all.mockResolvedValue([]);
    const r = await request(app).post('/api/node/history/get')
      .set('x-test-identity', 'viewer')
      .send({ pppUser: 'X' });
    expect(r.status).toBe(200);
  });
});

// Rutas de mutación que un viewer NUNCA debe poder ejecutar.
const MUTATION_ROUTES = [
  '/api/node/next',
  '/api/node/provision',
  '/api/node/deprovision',
  '/api/node/edit',
  '/api/node/label/save',
  '/api/node/tag/save',
  '/api/node/creds/save',
  '/api/node/ssh-creds/save',
  '/api/node/wg/set-peer',
  '/api/tunnel/repair',
];

describe('H1 — RBAC: un MEMBER (viewer) recibe 403 en mutaciones de nodos', () => {
  for (const route of MUTATION_ROUTES) {
    it(`POST ${route} → 403 para viewer`, async () => {
      const r = await request(app).post(route)
        .set('x-test-identity', 'viewer')
        .send({ pppUser: 'X', vrfName: 'VRF-ND1-X', lanSubnets: ['10.0.0.0/24'] });
      expect(r.status).toBe(403);
      // No debe tocar la BD (rechazado antes del handler).
      expect(db.run).not.toHaveBeenCalled();
    });
  }
});

// /node/history/add es append-only y NO se protege por rol (un MEMBER registra
// eventos de bitácora de sus nodos asignados); el gate es el WORKSPACE. Con
// requireOperator, el 403 de permisos se confundía con sesión expirada en el
// frontend → logout en cadena al activar el túnel.
describe('H1 — /node/history/add: gate por workspace, no por rol', () => {
  it('viewer con nodo AJENO a su workspace → 404 (no 403), sin escribir', async () => {
    db.get.mockResolvedValue(null); // nodeBelongsToRequester → false
    const r = await request(app).post('/api/node/history/add')
      .set('x-test-identity', 'viewer')
      .send({ pppUser: 'X', event: 'tunnel_activated' });
    expect(r.status).toBe(404);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('viewer con nodo de SU workspace → 200 y registra el evento', async () => {
    db.get.mockResolvedValueOnce({ ppp_user: 'X', nombre_vrf: 'VRF-ND2-X', workspace_id: 'ws-1' });
    const r = await request(app).post('/api/node/history/add')
      .set('x-test-identity', 'viewer')
      .send({ pppUser: 'X', event: 'tunnel_activated' });
    expect(r.status).toBe(200);
    expect(db.run).toHaveBeenCalledTimes(1);
  });
});

describe('H1 — RBAC: OWNER pasa el guard (no 403)', () => {
  for (const identity of ['owner']) {
    it(`POST /api/node/provision NO devuelve 403 para ${identity}`, async () => {
      const r = await request(app).post('/api/node/provision')
        .set('x-test-identity', identity)
        .send({ nodeName: 'X', lanSubnets: ['10.0.0.0/24'] });
      // Sin req.mikrotik el handler responde 503 NEEDS_CONFIG — lo relevante
      // es que el guard NO bloqueó (no es 403).
      expect(r.status).not.toBe(403);
    });
  }
});

describe('H5 — /node/tags filtra por workspace', () => {
  it('moderador (no platform_admin) → query con WHERE workspace_id', async () => {
    db.all.mockResolvedValue([]);
    const r = await request(app).get('/api/node/tags').set('x-test-identity', 'owner');
    expect(r.status).toBe(200);
    const [sql, params] = db.all.mock.calls[0];
    expect(sql).toMatch(/WHERE n\.workspace_id = \?/);
    expect(params).toEqual(['ws-1']);
  });

  it('platform_admin → query SIN filtro de workspace', async () => {
    db.all.mockResolvedValue([]);
    const r = await request(app).get('/api/node/tags').set('x-test-identity', 'platformAdmin');
    expect(r.status).toBe(200);
    const [sql, params] = db.all.mock.calls[0];
    expect(sql).not.toMatch(/workspace_id/);
    expect(params).toBeUndefined();
  });
});
