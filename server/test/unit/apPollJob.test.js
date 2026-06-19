// ============================================================
//  test/unit/apPollJob.test.js — recolección backend de CPEs (E1)
// ============================================================
const { stubModule } = require('../helpers/moduleMock');
const path = require('node:path');

const db = {
  run: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  all: vi.fn(async (sql) => {
    if (/FROM aps a JOIN ap_groups/.test(sql)) {
      return [{ id: 7, uuid: 'ap1', ip: '10.0.0.5', usuario_ssh: 'ubnt', clave_ssh_enc: 'secret', puerto_ssh: 22, node_id: 2, nombre_nodo: 'N', firmware: 'XW', nombre_vrf: 'VRF-A' }];
    }
    if (/FROM cpes WHERE mac IN/.test(sql)) return [{ mac: 'AA:BB:CC:DD:EE:FF', hostname: 'Casa', modelo: 'LBE' }];
    return [];
  }),
};

stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue(db),
  getApIntId: vi.fn().mockResolvedValue(7),
  getCpeIntId: vi.fn().mockResolvedValue(11),
  decryptPass: (s) => s,
  getAppSetting: vi.fn().mockResolvedValue('cfg'),
});
const apSvc = stubModule(__dirname, '../../ap.service', {
  pollAp: vi.fn().mockResolvedValue([{ mac: 'AA:BB:CC:DD:EE:FF', signal: -60, ccq: 90, lastip: '10.0.0.9' }]),
});
const sseMock = stubModule(__dirname, '../../lib/sse', { publish: vi.fn() });
// Opción C: por defecto SIN scan-IP → camino legacy (evita MySQL real).
const scanIpRepoMock = stubModule(__dirname, '../../db/repos/scanIpRepo', {
  getScanIpForWorkspace: vi.fn().mockResolvedValue(null),
});
const scanMangleMock = stubModule(__dirname, '../../lib/scanMangle', {
  setup: vi.fn().mockResolvedValue(undefined),
  teardown: vi.fn().mockResolvedValue(undefined),
});
stubModule(__dirname, '../../lib/scanLock', {
  withLock: vi.fn(async (_k, fn) => fn()),
  acquire: vi.fn(),
});

const JOB_PATH = require.resolve(path.join(__dirname, '..', '..', 'lib', 'apPollJob'));
const apWatch = require('../../lib/apWatch');
const apPollJob = require('../../lib/apPollJob');

beforeEach(() => {
  vi.clearAllMocks();
  apWatch._reset();
  db.run.mockResolvedValue(undefined);
  apSvc.pollAp.mockResolvedValue([{ mac: 'AA:BB:CC:DD:EE:FF', signal: -60, ccq: 90, lastip: '10.0.0.9' }]);
  scanIpRepoMock.getScanIpForWorkspace.mockResolvedValue(null); // default: legacy
});

afterAll(() => { delete require.cache[JOB_PATH]; });

describe('apPollJob.runOnce', () => {
  it('sin workspaces observados → no hace SSH', async () => {
    await apPollJob.runOnce();
    expect(apSvc.pollAp).not.toHaveBeenCalled();
    expect(sseMock.publish).not.toHaveBeenCalled();
  });

  it('workspace observado → pollea con creds de la DB, persiste y publica SSE', async () => {
    apWatch.touch('ws-1');
    await apPollJob.runOnce();

    // SSH al AP con IP/credenciales resueltas en backend
    expect(apSvc.pollAp).toHaveBeenCalledTimes(1);
    const [uuid, ip, port, user, pass] = apSvc.pollAp.mock.calls[0];
    expect(uuid).toBe('ap1');
    expect(ip).toBe('10.0.0.5');
    expect(port).toBe(22);
    expect(user).toBe('ubnt');
    expect(pass).toBe('secret');

    // Persistió en transacción + signal_history (saveHistory true)
    const runSqls = db.run.mock.calls.map(c => c[0]);
    expect(runSqls).toContain('BEGIN');
    expect(runSqls).toContain('COMMIT');
    expect(runSqls.some(s => /INSERT INTO signal_history/.test(s))).toBe(true);

    // Publicó por SSE al room del workspace, enriquecido
    expect(sseMock.publish).toHaveBeenCalledTimes(1);
    const [ws, ev, payload] = sseMock.publish.mock.calls[0];
    expect(ws).toBe('ws-1');
    expect(ev).toBe('ap-poll');
    expect(payload.apId).toBe('ap1');
    expect(payload.stations[0].isKnown).toBe(true);
    expect(payload.stations[0].hostname).toBe('Casa');
  });

  it('si pollAp falla → publica error y no rompe', async () => {
    apWatch.touch('ws-1');
    apSvc.pollAp.mockRejectedValueOnce(new Error('SSH timeout'));
    await apPollJob.runOnce();
    expect(sseMock.publish).toHaveBeenCalledTimes(1);
    const [, ev, payload] = sseMock.publish.mock.calls[0];
    expect(ev).toBe('ap-poll');
    expect(payload.error).toBe('SSH timeout');
  });

  it('Opción C: con scan-IP, monta mangle por VRF y ata el SSH (localAddress)', async () => {
    apWatch.touch('ws-1');
    scanIpRepoMock.getScanIpForWorkspace.mockResolvedValue('10.11.252.205');

    await apPollJob.runOnce();

    // mangle src=scan-IP → VRF del AP, y limpieza al final del ciclo
    expect(scanMangleMock.setup).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', scanIp: '10.11.252.205', vrfName: 'VRF-A' })
    );
    expect(scanMangleMock.teardown).toHaveBeenCalled();
    // pollAp recibió la scan-IP como localAddress (7º argumento)
    expect(apSvc.pollAp.mock.calls[0][6]).toBe('10.11.252.205');
  });
});
