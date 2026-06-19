// ============================================================
//  Opción C — mangle de escaneo por workspace (src=scan-IP → VRF).
//  Stubea routeros.service vía require.cache (patrón del repo); valida
//  comment, src-address, reemplazo y limpieza. Sin router real.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

let vrfPrint = [];
let manglePrint = [];
const calls = [];

const safeWrite = vi.fn(async (_api, cmd) => {
  calls.push(cmd);
  const c = cmd[0];
  if (c === '/ip/vrf/print') return vrfPrint;
  if (c === '/ip/firewall/mangle/print') return manglePrint;
  return [];
});
const writeIdempotent = vi.fn(async (_api, cmd) => { calls.push(cmd); return undefined; });

stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }),
  safeWrite,
  writeIdempotent,
  getErrorMessage: (e) => (e && e.message) || 'err',
  parseHandshakeSecs: () => 0,
});

const provisioner = require('../../lib/tunnelProvisioner');
const scanMangle = require('../../lib/scanMangle');

const MIKROTIK = { ip: '192.168.21.1', user: 'admin', pass: 'x' };
const WS = 'ws-1';
const SCAN_IP = '10.11.252.205';
const VRF = 'VRF-A';

const findCall = (predicate) => calls.find(predicate);

beforeEach(() => {
  vrfPrint = [];
  manglePrint = [];
  calls.length = 0;
});

describe('scanMangleComment', () => {
  it('usa namespace SCAN-WS separado del de túnel', () => {
    expect(provisioner.scanMangleComment('ws-1')).toBe('SCAN-WS-ws1');
    expect(provisioner.scanMangleComment('ws-1')).not.toBe(provisioner.mangleComment('ws-1'));
  });
});

describe('addScanMangle', () => {
  it('crea la regla con src=scan-IP, routing-mark=VRF y comment SCAN-WS', async () => {
    await provisioner.addScanMangle({}, { workspaceId: WS, scanIp: SCAN_IP, vrfName: VRF });
    const add = findCall(c => c[0] === '/ip/firewall/mangle/add');
    expect(add).toBeTruthy();
    expect(add).toContain(`=src-address=${SCAN_IP}`);
    expect(add).toContain(`=new-routing-mark=${VRF}`);
    expect(add).toContain('=comment=SCAN-WS-ws1');
  });

  it('exige scanIp y vrfName', async () => {
    await expect(provisioner.addScanMangle({}, { workspaceId: WS, vrfName: VRF })).rejects.toThrow(/scanIp/);
    await expect(provisioner.addScanMangle({}, { workspaceId: WS, scanIp: SCAN_IP })).rejects.toThrow(/vrfName/);
  });
});

describe('findScanMangleIds', () => {
  it('filtra por el comment del workspace', async () => {
    manglePrint = [
      { '.id': '*5', comment: 'SCAN-WS-ws1' },
      { '.id': '*6', comment: 'ACCESO-USER-abc' },
      { '.id': '*7', comment: 'SCAN-WS-otro' },
    ];
    const ids = await provisioner.findScanMangleIds({}, WS);
    expect(ids).toEqual(['*5']);
  });
});

describe('scanMangle.setup', () => {
  it('reemplaza la mangle previa del workspace y crea la nueva', async () => {
    vrfPrint = [{ name: VRF }];
    manglePrint = [{ '.id': '*5', comment: 'SCAN-WS-ws1' }];

    await scanMangle.setup({ workspaceId: WS, scanIp: SCAN_IP, vrfName: VRF, mikrotik: MIKROTIK });

    const removed = findCall(c => c[0] === '/ip/firewall/mangle/remove' && c.includes('=.id=*5'));
    const added = findCall(c => c[0] === '/ip/firewall/mangle/add' && c.includes(`=src-address=${SCAN_IP}`));
    expect(removed).toBeTruthy();
    expect(added).toBeTruthy();
  });

  it('lanza si el VRF no existe (no debe escanear sin ruta)', async () => {
    vrfPrint = []; // VRF inexistente
    await expect(
      scanMangle.setup({ workspaceId: WS, scanIp: SCAN_IP, vrfName: VRF, mikrotik: MIKROTIK })
    ).rejects.toThrow(/no existe/);
  });
});

describe('scanMangle.teardown', () => {
  it('elimina la mangle del workspace y no lanza ante fallo', async () => {
    manglePrint = [{ '.id': '*9', comment: 'SCAN-WS-ws1' }];
    await expect(scanMangle.teardown({ workspaceId: WS, mikrotik: MIKROTIK })).resolves.toBeUndefined();
    const removed = findCall(c => c[0] === '/ip/firewall/mangle/remove' && c.includes('=.id=*9'));
    expect(removed).toBeTruthy();
  });
});
