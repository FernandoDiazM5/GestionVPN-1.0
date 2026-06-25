// ============================================================
//  scanMangleSync — ata la mangle de escaneo al ciclo del túnel.
//  Stubea scanIpRepo y scanMangle; usa el scanLock REAL para validar
//  que respeta el lock (tryAcquire) y que es best-effort (nunca lanza).
// ============================================================
const { stubModule, unstubModule } = require('../helpers/moduleMock');

let scanIp = '10.11.252.7';
const setup = vi.fn().mockResolvedValue(undefined);
const teardown = vi.fn().mockResolvedValue(undefined);

stubModule(__dirname, '../../db/repos/scanIpRepo', {
  resolveForWorkspace: vi.fn(async () => scanIp),
});
stubModule(__dirname, '../../lib/scanMangle', { setup, teardown });

const scanLock = require('../../lib/scanLock');
const sync = require('../../lib/scanMangleSync');

const MIKROTIK = { ip: '10.14.250.1', user: 'admin', pass: 'x' };
const WS = 'ws-sync';
const VRF = 'VRF-ND2-TORREHOUSENET';

beforeEach(() => {
  scanIp = '10.11.252.7';
  setup.mockClear();
  teardown.mockClear();
});

afterAll(() => {
  unstubModule(__dirname, '../../db/repos/scanIpRepo');
  unstubModule(__dirname, '../../lib/scanMangle');
});

describe('onTunnelActivated', () => {
  it('apunta la scan mangle al VRF activado', async () => {
    await sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: MIKROTIK });
    expect(setup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WS, scanIp: '10.11.252.7', vrfName: VRF, mikrotik: MIKROTIK,
    }));
  });

  it('no-op si el workspace no tiene scan-IP', async () => {
    scanIp = null;
    await sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: MIKROTIK });
    expect(setup).not.toHaveBeenCalled();
  });

  it('no-op si falta el router (mikrotik sin ip)', async () => {
    await sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: {} });
    expect(setup).not.toHaveBeenCalled();
  });

  it('best-effort: no lanza aunque setup falle', async () => {
    setup.mockRejectedValueOnce(new Error('router caído'));
    await expect(sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: MIKROTIK }))
      .resolves.toBeUndefined();
  });

  it('respeta el lock: si está ocupado, NO toca la mangle', async () => {
    const release = scanLock.tryAcquire(WS);     // ocupa el lock
    await sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: MIKROTIK });
    expect(setup).not.toHaveBeenCalled();
    release();
  });
});

describe('onTunnelClosed', () => {
  it('borra la scan mangle del workspace', async () => {
    await sync.onTunnelClosed({ workspaceId: WS, mikrotik: MIKROTIK });
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, mikrotik: MIKROTIK }));
  });

  it('no-op si el workspace no tiene scan-IP', async () => {
    scanIp = null;
    await sync.onTunnelClosed({ workspaceId: WS, mikrotik: MIKROTIK });
    expect(teardown).not.toHaveBeenCalled();
  });

  it('es AUTORITATIVO: borra aunque el lock esté ocupado (deactivate/expiración manda)', async () => {
    const release = scanLock.tryAcquire(WS);     // lock ocupado (p.ej. gracia de un escaneo)
    await sync.onTunnelClosed({ workspaceId: WS, mikrotik: MIKROTIK });
    expect(teardown).toHaveBeenCalledTimes(1);   // NO se salta el teardown
    release();
  });
});
