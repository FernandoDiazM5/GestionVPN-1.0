// ============================================================
//  diagnostics.test.js — parser de ping + summarize + Zod (Q3)
//
//  No tocamos el router. Mockeamos safeWrite con la salida típica
//  que devuelve node-routeros para /tool/ping y /tool/traceroute.
//  El handler usa esos resultados para armar { rows, summary } y
//  { hops } — eso es lo que verificamos acá.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const rosMocks = stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn(),
  safeWrite: vi.fn(),
  getErrorMessage: (err) => err?.message || 'error',
});

// El router monta express con verifyToken — no necesitamos eso aquí:
// importamos la ruta directamente y la ejercemos con supertest contra
// un mini-Express sin middleware de autenticación.
const express = require('express');
const request = require('supertest');

// Stub minimo de apiResponse: lo usa el handler directamente (asyncHandler).
// Si lo dejamos pasar al real, jala configuración global; preferimos aislar.
const apiResp = require('../../lib/apiResponse');

const router = require('../../routes/diagnostics.routes');

function makeApp({ account = { sub: 'user-1' }, mikrotik = { ip: '1.2.3.4', user: 'admin', pass: 'p' } } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.account = account; req.mikrotik = mikrotik; next(); });
  app.use('/api', router);
  app.use(apiResp.errorMiddleware);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  rosMocks.connectToMikrotik.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) });
});

describe('POST /api/diagnostics/ping', () => {
  it('parsea filas y arma summary (3 de 4 OK)', async () => {
    rosMocks.safeWrite.mockResolvedValue([
      { seq: '0', host: '192.168.50.1', size: '56', ttl: '63', time: '12ms' },
      { seq: '1', host: '192.168.50.1', size: '56', ttl: '63', time: '14ms' },
      { seq: '2', status: 'timeout' },
      { seq: '3', host: '192.168.50.1', size: '56', ttl: '63', time: '11ms' },
    ]);

    const res = await request(makeApp())
      .post('/api/diagnostics/ping')
      .send({ target: '192.168.50.1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.target).toBe('192.168.50.1');
    expect(res.body.rows).toHaveLength(4);
    expect(res.body.summary.sent).toBe(4);
    expect(res.body.summary.received).toBe(3);
    expect(res.body.summary.lossPct).toBe(25);
    expect(res.body.summary.avgMs).toBeGreaterThan(0);
    expect(res.body.summary.minMs).toBe(11);
    expect(res.body.summary.maxMs).toBe(14);
  });

  it('rechaza target inválido (422 ZodError)', async () => {
    const res = await request(makeApp())
      .post('/api/diagnostics/ping')
      .send({ target: '999.no.es.una.ip!' });
    expect(res.status).toBe(422);
  });

  it('rechaza sin mikrotik configurado (503)', async () => {
    const res = await request(makeApp({ mikrotik: null }))
      .post('/api/diagnostics/ping')
      .send({ target: '8.8.8.8' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NEEDS_CONFIG');
  });

  it('rechaza sin sesión (401)', async () => {
    const res = await request(makeApp({ account: null }))
      .post('/api/diagnostics/ping')
      .send({ target: '8.8.8.8' });
    expect(res.status).toBe(401);
  });

  it('rate-limit dispara 429 al 6º hit', async () => {
    rosMocks.safeWrite.mockResolvedValue([]);
    const app = makeApp({ account: { sub: 'rl-user' } });
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/diagnostics/ping').send({ target: '8.8.8.8' });
      expect(r.status).toBe(200);
    }
    const sixth = await request(app).post('/api/diagnostics/ping').send({ target: '8.8.8.8' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('RATE_LIMITED');
  });
});

describe('POST /api/diagnostics/traceroute', () => {
  it('agrupa hops y consolida last-known address/rtt', async () => {
    rosMocks.safeWrite.mockResolvedValue([
      {
        'address-1': '10.0.0.1', 'rtt-1': '2ms', 'loss-1': '0', 'status-1': 'reached',
        'address-2': '10.0.1.1', 'rtt-2': '5ms', 'loss-2': '0',
        'address-3': '192.168.50.1', 'rtt-3': '12ms', 'loss-3': '0', 'status-3': 'reached',
      },
    ]);

    const res = await request(makeApp({ account: { sub: 'trace-user-a' } }))
      .post('/api/diagnostics/traceroute')
      .send({ target: '192.168.50.1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.hops).toHaveLength(3);
    expect(res.body.hops[0]).toMatchObject({ hop: 1, address: '10.0.0.1', rttMs: 2 });
    expect(res.body.hops[2]).toMatchObject({ hop: 3, address: '192.168.50.1', rttMs: 12, status: 'reached' });
  });

  it('hop sin respuesta queda con address null y timeout', async () => {
    rosMocks.safeWrite.mockResolvedValue([
      {
        'status-1': 'timeout', 'loss-1': '100',
        'address-2': '10.0.0.1', 'rtt-2': '5ms', 'loss-2': '0',
      },
    ]);

    const res = await request(makeApp({ account: { sub: 'trace-user-b' } }))
      .post('/api/diagnostics/traceroute')
      .send({ target: '8.8.8.8' });

    expect(res.status).toBe(200);
    // hop-1 sólo apareció en status-1/loss-1; no en address-* — no se incluye.
    // hop-2 sí tiene address.
    expect(res.body.hops).toHaveLength(1);
    expect(res.body.hops[0]).toMatchObject({ hop: 2, address: '10.0.0.1', rttMs: 5 });
  });
});
