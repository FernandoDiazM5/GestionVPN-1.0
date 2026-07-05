// ============================================================
//  scanMangleSync — ata la mangle de escaneo al ciclo del túnel.
//  Stubea scanIpRepo y scanMangle; usa el scanLock REAL para validar
//  que respeta el lock (tryAcquire) y que es best-effort (nunca lanza).
// ============================================================
const { stubModule, unstubModule } = require('../helpers/moduleMock');

let scanIp = '10.11.252.7';
let scanMode = 'vps';
let allocatedIp = '10.11.252.9';
const setup = vi.fn().mockResolvedValue(undefined);
const teardown = vi.fn().mockResolvedValue(undefined);
const allocate = vi.fn(async () => allocatedIp);

stubModule(__dirname, '../../db/repos/scanIpRepo', {
  resolveForWorkspace: vi.fn(async () => scanIp),
  getSetting: vi.fn(async () => scanMode),
  allocate,
});
stubModule(__dirname, '../../lib/scanMangle', { setup, teardown });

const scanLock = require('../../lib/scanLock');
const sync = require('../../lib/scanMangleSync');

const MIKROTIK = { ip: '10.14.250.1', user: 'admin', pass: 'x' };
const WS = 'ws-sync';
const VRF = 'VRF-ND2-TORREHOUSENET';

beforeEach(() => {
  scanIp = '10.11.252.7';
  scanMode = 'vps';
  allocatedIp = '10.11.252.9';
  setup.mockClear();
  teardown.mockClear();
  allocate.mockClear();
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

  it('auto-asigna scan-IP del pool (modo vps) si el workspace no la tiene y monta la mangle', async () => {
    scanIp = null;              // workspace sin Opción C
    scanMode = 'vps';
    await sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: MIKROTIK });
    expect(allocate).toHaveBeenCalledWith(WS);
    expect(setup).toHaveBeenCalledWith(expect.objectContaining({ scanIp: '10.11.252.9', vrfName: VRF }));
  });

  it('no-op en modo local si no hay scan-IP global (no asigna del pool)', async () => {
    scanIp = null;
    scanMode = 'local';
    await sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: MIKROTIK });
    expect(allocate).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });

  it('no-op si el pool está agotado (allocate falla) — best-effort', async () => {
    scanIp = null;
    allocate.mockRejectedValueOnce(new Error('pool agotado'));
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

  it('sincroniza la mangle SIN depender del lock (es el único gestor)', async () => {
    const release = scanLock.tryAcquire(WS);     // aunque algo tenga el lock...
    await sync.onTunnelActivated({ workspaceId: WS, vrfName: VRF, mikrotik: MIKROTIK });
    expect(setup).toHaveBeenCalledTimes(1);      // ...igual monta la mangle
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

  it('borra la mangle SIN depender del lock (deactivate/expiración manda)', async () => {
    const release = scanLock.tryAcquire(WS);     // aunque algo tenga el lock...
    await sync.onTunnelClosed({ workspaceId: WS, mikrotik: MIKROTIK });
    expect(teardown).toHaveBeenCalledTimes(1);   // ...igual borra
    release();
  });
});
