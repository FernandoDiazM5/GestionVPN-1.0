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
  encryptPass: (s) => (s ? `enc:${s}` : null),
  decryptPass: (s) => s,
  getAppSetting: vi.fn().mockResolvedValue('203.0.113.10'),
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
const { saveNode } = require('../../db.service');

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
  // clearAllMocks NO resetea implementaciones: restaurar el default de writeIdempotent
  // para que el mockImplementation que lanza (tests H4) no se filtre a otros tests.
  writeIdempotent.mockReset();
  writeIdempotent.mockResolvedValue(undefined);
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

  it('SSTP remote-address = IP única determinística del nodo (= gestión)', async () => {
    // Modelo unificado: el remote-address se deriva del nº de nodo, no de un
    // pool. Sin VRF previos → primer nodo es ND2 (ND1 reservado) → 10.11.251.2.
    const r = await request(app).post('/api/node/provision')
      .send({ ...baseSstp, nodeNumber: 2 });
    expect(r.status).toBe(200);
    expect(r.body.remoteAddress).toBe('10.11.251.2');
    expect(callFor('/ppp/secret/add')).toEqual(
      expect.arrayContaining(['=remote-address=10.11.251.2'])
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

describe('Auto-gen de llaves WG del CPE', () => {
  const baseWg = { nodeName: 'TORREX', protocol: 'wireguard', lanSubnets: ['10.5.0.0/24'] };

  it('sin cpePublicKey → genera el par, agrega el peer y persiste pública + privada cifrada', async () => {
    const r = await request(app).post('/api/node/provision').send({ ...baseWg, nodeNumber: 2 });
    expect(r.status).toBe(200);
    expect(r.body.cpeKeyMode).toBe('generated');

    // El peer del Core se agrega SIEMPRE (ya no se omite) con una pública generada.
    const peerArgs = callFor('/interface/wireguard/peers/add');
    expect(peerArgs).toBeTruthy();
    const pubArg = peerArgs.find(a => a.startsWith('=public-key='));
    expect(pubArg).toMatch(/^=public-key=[A-Za-z0-9+/]{43}=$/);

    // saveNode recibe la pública del CPE y la privada cifrada.
    const saved = saveNode.mock.calls.at(-1)[0];
    expect(saved.wg_cpe_public).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(saved.wg_cpe_private_enc).toMatch(/^enc:/);

    // El script devuelto trae la privada embebida y las rutas de retorno.
    expect(r.body.cpeScript).toContain('private-key="');
    expect(r.body.cpeScript).toContain('endpoint-address=203.0.113.10');
  });

  it('con cpePublicKey → modo manual: usa esa clave y NO almacena privada', async () => {
    const myKey = 'A'.repeat(43) + '=';
    const r = await request(app).post('/api/node/provision')
      .send({ ...baseWg, nodeNumber: 2, cpePublicKey: myKey });
    expect(r.status).toBe(200);
    expect(r.body.cpeKeyMode).toBe('manual');

    const peerArgs = callFor('/interface/wireguard/peers/add');
    expect(peerArgs).toEqual(expect.arrayContaining([`=public-key=${myKey}`]));

    const saved = saveNode.mock.calls.at(-1)[0];
    expect(saved.wg_cpe_public).toBe(myKey);
    expect(saved.wg_cpe_private_enc).toBeNull();
    // Sin privada → el script no la embebe.
    expect(r.body.cpeScript || '').not.toContain('private-key="');
  });
});

describe('Auto-gen de credenciales PPP (SSTP)', () => {
  const baseWgless = { nodeName: 'TORREZ', protocol: 'sstp', lanSubnets: ['10.7.0.0/24'] };

  it('sin pppUser/pppPassword → genera ambos, crea el secret y devuelve el script con credenciales', async () => {
    const r = await request(app).post('/api/node/provision').send({ ...baseWgless, nodeNumber: 2 });
    expect(r.status).toBe(200);
    expect(r.body.sstpCredMode).toBe('generated');
    expect(r.body.pppUser).toBe('ppp-torrez-nd2');
    expect(r.body.pppPassword).toMatch(/^[A-Za-z0-9]{20}$/);

    // El PPP secret se crea con el usuario+contraseña generados.
    const secretArgs = callFor('/ppp/secret/add');
    expect(secretArgs).toEqual(expect.arrayContaining(['=name=ppp-torrez-nd2']));
    expect(secretArgs.find(a => a.startsWith('=password='))).toBe(`=password=${r.body.pppPassword}`);

    // El script del CPE trae las credenciales embebidas (autoconfigurable).
    expect(r.body.cpeScript).toContain('user=ppp-torrez-nd2');
    expect(r.body.cpeScript).toContain(`password=${r.body.pppPassword}`);

    // saveNode persiste con el ppp_user efectivo (generado).
    const saved = saveNode.mock.calls.at(-1)[0];
    expect(saved.ppp_user).toBe('ppp-torrez-nd2');
  });

  it('con pppUser/pppPassword → modo manual: respeta los del cliente', async () => {
    const r = await request(app).post('/api/node/provision')
      .send({ ...baseWgless, nodeNumber: 2, pppUser: 'mi-usuario', pppPassword: 'mi-clave-123' });
    expect(r.status).toBe(200);
    expect(r.body.sstpCredMode).toBe('manual');
    expect(r.body.pppUser).toBe('mi-usuario');
    expect(callFor('/ppp/secret/add')).toEqual(
      expect.arrayContaining(['=name=mi-usuario', '=password=mi-clave-123'])
    );
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
