// ============================================================
//  monitoringJob.test.js — anti-flap y cooldown (M5)
//
//  Mockeamos routeros (lo que devuelve /ppp/active), db.service
//  (nodos + creds + workspace_members), monitoringRepo (estado
//  previo) y notifier. Probamos:
//   • 3 polls fallidos seguidos NO disparan NODE_DOWN hasta el 3º.
//   • Tras NODE_DOWN, no se repite la alerta dentro del cooldown.
//   • Tras cooldown vencido, sí se repite si sigue caído.
//   • Recovery (UP tras DOWN) dispara NODE_RECOVERED y resetea
//     fail_count.
//   • Nodo siempre UP nunca alerta.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const routerosMocks = stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn(),
  safeWrite: vi.fn(),
  getErrorMessage: (err) => err?.message || 'error',
});

const dbServiceMocks = stubModule(__dirname, '../../db.service', {
  getDb: vi.fn(),
  getAppSetting: vi.fn(),
  decryptPass: (s) => s,
  encryptPass: (s) => s,
  hasUsers: vi.fn(),
  getUserByUsername: vi.fn(),
  createUser: vi.fn(),
});

const monRepoMocks = stubModule(__dirname, '../../db/repos/monitoringRepo', {
  listAll: vi.fn(),
  listByWorkspace: vi.fn(),
  recordCheck: vi.fn().mockResolvedValue(undefined),
});

const notifierMocks = stubModule(__dirname, '../../lib/notifier', {
  notify: vi.fn().mockResolvedValue({ results: {} }),
});

const monitoringJob = require('../../lib/monitoringJob');

// Helper para armar el db mock (db.all → nodes, db.get → owner)
function mockDb({ nodes = [], owner = { user_id: 'owner-1' } } = {}) {
  return {
    all: vi.fn().mockResolvedValue(nodes),
    get: vi.fn().mockResolvedValue(owner),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Creds del router siempre OK por defecto
  dbServiceMocks.getAppSetting.mockImplementation(async (k) => {
    if (k === 'MT_IP') return '10.0.0.1';
    if (k === 'MT_USER') return 'admin';
    if (k === 'MT_PASS') return 'enc';
    return null;
  });
  // /ppp/active vacío por defecto (todos los nodos caídos)
  routerosMocks.connectToMikrotik.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) });
  routerosMocks.safeWrite.mockResolvedValue([]);
});

describe('anti-flap: NODE_DOWN solo tras umbral', () => {
  const NODE = { ppp_user: 'vrf-A', nombre_nodo: 'Sede A', nombre_vrf: 'VRF-A', workspace_id: 'ws-1' };

  it('1er poll fallido → NO alerta (fail_count=1)', async () => {
    dbServiceMocks.getDb.mockResolvedValue(mockDb({ nodes: [NODE] }));
    monRepoMocks.listAll.mockResolvedValue([]);   // primer chequeo
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).not.toHaveBeenCalled();
    expect(monRepoMocks.recordCheck).toHaveBeenCalledWith(expect.objectContaining({
      status: 'down', newFailCount: 1, alertSent: false,
    }));
  });

  it('2º poll fallido → NO alerta (fail_count=2)', async () => {
    dbServiceMocks.getDb.mockResolvedValue(mockDb({ nodes: [NODE] }));
    monRepoMocks.listAll.mockResolvedValue([
      { workspace_id: 'ws-1', target_kind: 'node', target_id: 'vrf-A',
        last_status: 'down', fail_count: 1, last_check_at: Date.now() - 5*60_000,
        last_alert_at: null, last_recovery_at: null },
    ]);
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).not.toHaveBeenCalled();
    expect(monRepoMocks.recordCheck).toHaveBeenCalledWith(expect.objectContaining({
      status: 'down', newFailCount: 2, alertSent: false,
    }));
  });

  it('3er poll fallido → dispara NODE_DOWN al OWNER del workspace', async () => {
    dbServiceMocks.getDb.mockResolvedValue(mockDb({
      nodes: [NODE],
      owner: { user_id: 'owner-ws1' },
    }));
    monRepoMocks.listAll.mockResolvedValue([
      { workspace_id: 'ws-1', target_kind: 'node', target_id: 'vrf-A',
        last_status: 'down', fail_count: 2, last_check_at: Date.now() - 5*60_000,
        last_alert_at: null, last_recovery_at: null },
    ]);
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).toHaveBeenCalledTimes(1);
    const call = notifierMocks.notify.mock.calls[0][0];
    expect(call.userId).toBe('owner-ws1');
    expect(call.event).toBe('NODE_DOWN');
    expect(call.payload).toMatchObject({
      tunnelId: 'VRF-A', nodeName: 'Sede A', failCount: 3,
    });
    expect(monRepoMocks.recordCheck).toHaveBeenCalledWith(expect.objectContaining({
      status: 'down', newFailCount: 3, alertSent: true,
    }));
  });
});

describe('cooldown: no spamea alertas DOWN repetidas', () => {
  const NODE = { ppp_user: 'vrf-B', nombre_nodo: 'Sede B', nombre_vrf: 'VRF-B', workspace_id: 'ws-1' };

  it('si ya hubo NODE_DOWN hace 10min (cooldown 30min) → NO repite', async () => {
    dbServiceMocks.getDb.mockResolvedValue(mockDb({ nodes: [NODE] }));
    monRepoMocks.listAll.mockResolvedValue([
      { workspace_id: 'ws-1', target_kind: 'node', target_id: 'vrf-B',
        last_status: 'down', fail_count: 5, last_check_at: Date.now() - 5*60_000,
        last_alert_at: Date.now() - 10*60_000, last_recovery_at: null },
    ]);
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).not.toHaveBeenCalled();
  });

  it('si el cooldown ya pasó (35min) → vuelve a alertar', async () => {
    dbServiceMocks.getDb.mockResolvedValue(mockDb({ nodes: [NODE] }));
    monRepoMocks.listAll.mockResolvedValue([
      { workspace_id: 'ws-1', target_kind: 'node', target_id: 'vrf-B',
        last_status: 'down', fail_count: 5, last_check_at: Date.now() - 5*60_000,
        last_alert_at: Date.now() - 35*60_000, last_recovery_at: null },
    ]);
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).toHaveBeenCalledTimes(1);
    expect(notifierMocks.notify.mock.calls[0][0].event).toBe('NODE_DOWN');
  });
});

describe('NODE_RECOVERED', () => {
  const NODE = { ppp_user: 'vrf-C', nombre_nodo: 'Sede C', nombre_vrf: 'VRF-C', workspace_id: 'ws-1' };

  it('UP tras DOWN dispara NODE_RECOVERED con downSeconds y resetea fail_count', async () => {
    routerosMocks.safeWrite.mockResolvedValue([{ name: 'vrf-C' }]);   // ya está vivo
    dbServiceMocks.getDb.mockResolvedValue(mockDb({ nodes: [NODE], owner: { user_id: 'owner-c' } }));
    const alertTs = Date.now() - 20 * 60_000;
    monRepoMocks.listAll.mockResolvedValue([
      { workspace_id: 'ws-1', target_kind: 'node', target_id: 'vrf-C',
        last_status: 'down', fail_count: 7, last_check_at: Date.now() - 5*60_000,
        last_alert_at: alertTs, last_recovery_at: null },
    ]);
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).toHaveBeenCalledTimes(1);
    const call = notifierMocks.notify.mock.calls[0][0];
    expect(call.event).toBe('NODE_RECOVERED');
    expect(call.payload.downSeconds).toBeGreaterThan(0);
    expect(monRepoMocks.recordCheck).toHaveBeenCalledWith(expect.objectContaining({
      status: 'up', newFailCount: 0, recoverySent: true,
    }));
  });

  it('UP sin previo DOWN no dispara nada', async () => {
    routerosMocks.safeWrite.mockResolvedValue([{ name: 'vrf-C' }]);
    dbServiceMocks.getDb.mockResolvedValue(mockDb({ nodes: [NODE] }));
    monRepoMocks.listAll.mockResolvedValue([]);   // sin estado previo
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).not.toHaveBeenCalled();
    expect(monRepoMocks.recordCheck).toHaveBeenCalledWith(expect.objectContaining({
      status: 'up', newFailCount: 0, recoverySent: false,
    }));
  });
});

describe('robustez', () => {
  it('sin creds MT_* → no hace nada (no throw)', async () => {
    dbServiceMocks.getAppSetting.mockResolvedValue(null);
    await expect(monitoringJob.runOnce()).resolves.toBeUndefined();
    expect(monRepoMocks.recordCheck).not.toHaveBeenCalled();
  });

  it('si el router no responde, el tick termina sin alertas', async () => {
    routerosMocks.connectToMikrotik.mockRejectedValue(new Error('ECONNREFUSED'));
    dbServiceMocks.getDb.mockResolvedValue(mockDb({ nodes: [{ ppp_user: 'x', nombre_nodo: 'X', workspace_id: 'ws-1' }] }));
    monRepoMocks.listAll.mockResolvedValue([]);
    await monitoringJob.runOnce();
    expect(notifierMocks.notify).not.toHaveBeenCalled();
    expect(monRepoMocks.recordCheck).not.toHaveBeenCalled();
  });
});
