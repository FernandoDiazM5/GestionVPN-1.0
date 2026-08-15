const { stubModule } = require('../helpers/moduleMock');

const db = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
};
stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  encryptPass: value => value,
  saveNode: vi.fn(),
  getAppSetting: vi.fn(),
});
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});
stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn(),
  safeWrite: vi.fn(),
  writeIdempotent: vi.fn(),
  getErrorMessage: error => error?.message || 'error',
});
const routerCleanup = vi.fn().mockResolvedValue({ steps: [] });
stubModule(__dirname, '../../lib/nodeDeprovision', { deprovisionNodeOnRouter: routerCleanup });

const impact = {
  node: { id: 7, workspace_id: 'ws-1', nombre_nodo: 'Sitio Uno', ppp_user: 'PPP-1', nombre_vrf: 'VRF-1' },
  devices: 2, deviceIds: ['ap-1', 'ap-2'], cpes: 4, snapshots: 2, signalHistory: 9,
  towers: 0, activeSessions: 1, assignments: 1, pendingInvitations: 0,
  ambiguousDevices: 0, fingerprint: 'a'.repeat(64),
};
const loadImpact = vi.fn().mockResolvedValue(impact);
const deleteSiteData = vi.fn().mockResolvedValue(impact);
stubModule(__dirname, '../../lib/siteDeletionService', {
  loadImpact,
  publicImpact: value => value,
  deleteSiteData,
});
stubModule(__dirname, '../../db/repos/assignmentRepo', { assignedTunnelIds: vi.fn().mockResolvedValue([]) });
stubModule(__dirname, '../../db/repos/sessionRepo', { activeMapForWorkspace: vi.fn().mockResolvedValue(new Map()) });

const express = require('express');
const request = require('supertest');
const routes = require('../../routes/nodes/provision.routes');
const { errorMiddleware } = require('../../lib/apiResponse');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const member = req.headers['x-role'] === 'member';
  req.account = { sub: member ? 'member-1' : 'owner-1', workspace_id: 'ws-1', role: member ? 'MEMBER' : 'OWNER', platform_admin: false };
  req.mikrotik = { ip: '192.0.2.1', user: 'admin', pass: 'secret' };
  next();
});
app.use('/api', routes);
app.use(errorMiddleware);

beforeEach(() => {
  vi.clearAllMocks();
  db.get.mockResolvedValue({ ppp_user: 'PPP-1', nombre_vrf: 'VRF-1', workspace_id: 'ws-1' });
  loadImpact.mockResolvedValue(impact);
  deleteSiteData.mockResolvedValue(impact);
  routerCleanup.mockResolvedValue({ steps: [] });
});

describe('borrado seguro de sitio', () => {
  it('rechaza MEMBER antes de calcular impacto', async () => {
    const response = await request(app).post('/api/node/deprovision-impact')
      .set('x-role', 'member').send({ pppUser: 'PPP-1', vrfName: 'VRF-1' });
    expect(response.status).toBe(403);
    expect(loadImpact).not.toHaveBeenCalled();
  });

  it('devuelve preview aislado para OWNER', async () => {
    const response = await request(app).post('/api/node/deprovision-impact')
      .send({ pppUser: 'PPP-1', vrfName: 'VRF-1' });
    expect(response.status).toBe(200);
    expect(response.body.impact).toMatchObject({ devices: 2, cpes: 4, fingerprint: 'a'.repeat(64) });
    expect(loadImpact).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }));
  });

  it('no toca RouterOS si el nombre de confirmación no coincide', async () => {
    const response = await request(app).post('/api/node/deprovision').send({
      pppUser: 'PPP-1', vrfName: 'VRF-1', protocol: 'sstp',
      confirmationName: 'Otro sitio', impactFingerprint: 'a'.repeat(64),
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SITE_CONFIRMATION_MISMATCH');
    expect(routerCleanup).not.toHaveBeenCalled();
  });

  it('limpia RouterOS y luego ejecuta la cascada confirmada', async () => {
    const response = await request(app).post('/api/node/deprovision').send({
      pppUser: 'PPP-1', vrfName: 'VRF-1', protocol: 'sstp',
      confirmationName: 'Sitio Uno', impactFingerprint: 'a'.repeat(64),
    });
    expect(response.status).toBe(200);
    expect(routerCleanup).toHaveBeenCalledTimes(1);
    expect(deleteSiteData).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1', expectedFingerprint: 'a'.repeat(64), actorUserId: 'owner-1',
    }));
    expect(response.body.deletedDeviceIds).toEqual(['ap-1', 'ap-2']);
  });
});
