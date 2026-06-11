// ============================================================
//  auditExport.test.js — POST /api/audit/export (Q4)
//
//  Cubre el handler completo: zod parse, headers Content-Disposition,
//  CSV con BOM, JSON con meta, rate limit, validación de rango.
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const repoMocks = stubModule(__dirname, '../../db/repos/auditRepo', {
  log: vi.fn(),
  list: vi.fn(),
  listForExport: vi.fn(),
});

// authJwt — simulamos sesión inyectando req.account en el middleware del test
stubModule(__dirname, '../../middleware/authJwt', {
  requireSession: (req, _res, next) => next(),
  invalidateUserCache: vi.fn(),
});

// audit helper no se ejercita aquí
stubModule(__dirname, '../../lib/audit', {
  recordTunnelLog: vi.fn(),
});

// rateLimit clientIp
stubModule(__dirname, '../../lib/rateLimit', {
  clientIp: () => '127.0.0.1',
});

const express = require('express');
const request = require('supertest');
const apiResp = require('../../lib/apiResponse');
const router = require('../../routes/audit.routes');

function makeApp({ account = { sub: 'u-1', workspace_id: 'ws-1' } } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.account = account; next(); });
  app.use('/api/audit', router);
  app.use(apiResp.errorMiddleware);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/audit/export — CSV', () => {
  it('responde 200 con text/csv y Content-Disposition', async () => {
    repoMocks.listForExport.mockResolvedValue([
      { id: 'r1', tunnel_id: 'VRF-X', action: 'ACTIVATE', ip_address: '1.2.3.4',
        detail: 'ok', created_at: 1717948800000, user_id: 'u1', user_email: 'a@b.com', user_name: 'Ana' },
    ]);
    const res = await request(makeApp({ account: { sub: 'csv-user', workspace_id: 'ws-1' } }))
      .post('/api/audit/export')
      .send({ format: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="audit-.*\.csv"/);
    // BOM + header + 1 data row
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xFEFF);   // BOM
    expect(text).toMatch(/created_at_iso/);
    expect(text).toMatch(/ACTIVATE/);
    expect(text).toMatch(/a@b\.com/);
  });

  it('CSV escapa correctamente campos con coma/comillas', async () => {
    repoMocks.listForExport.mockResolvedValue([
      { id: 'r1', tunnel_id: 'VRF-A', action: 'NOTE', ip_address: null,
        detail: 'incluye, coma "con quotes"', created_at: 1717948800000,
        user_id: null, user_email: null, user_name: null },
    ]);
    const res = await request(makeApp({ account: { sub: 'csv-escape', workspace_id: 'ws-1' } }))
      .post('/api/audit/export')
      .send({ format: 'csv' });
    expect(res.status).toBe(200);
    // El detail debe estar entrecomillado y las " duplicadas
    expect(res.text).toMatch(/"incluye, coma ""con quotes"""/);
  });
});

describe('POST /api/audit/export — JSON', () => {
  it('responde 200 con application/json + meta correcto', async () => {
    repoMocks.listForExport.mockResolvedValue([
      { id: 'a', tunnel_id: 'VRF-Y', action: 'DEACTIVATE', ip_address: null,
        detail: null, created_at: 1700000000000, user_id: null, user_email: null, user_name: null },
    ]);
    const res = await request(makeApp({ account: { sub: 'json-user', workspace_id: 'ws-1' } }))
      .post('/api/audit/export')
      .send({ format: 'json', from: 1700000000000, to: 1717948800000, tunnelId: 'VRF-Y', action: 'DEACTIVATE' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = JSON.parse(res.text);
    expect(body.success).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.meta).toMatchObject({
      from: 1700000000000, to: 1717948800000,
      tunnelId: 'VRF-Y', action: 'DEACTIVATE', count: 1,
    });
  });
});

describe('POST /api/audit/export — validación', () => {
  it('rango inválido (to < from) → 422 BAD_RANGE', async () => {
    const res = await request(makeApp({ account: { sub: 'bad-range', workspace_id: 'ws-1' } }))
      .post('/api/audit/export')
      .send({ from: 2000, to: 1000 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BAD_RANGE');
  });

  it('format inválido (cualquier otra cosa) → 422 ZodError', async () => {
    const res = await request(makeApp({ account: { sub: 'bad-fmt', workspace_id: 'ws-1' } }))
      .post('/api/audit/export')
      .send({ format: 'pdf' });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/audit/export — rate limit', () => {
  it('segundo export en <5s con MISMO user → 429', async () => {
    repoMocks.listForExport.mockResolvedValue([]);
    const app = makeApp({ account: { sub: 'rl-export', workspace_id: 'ws-1' } });
    const first = await request(app).post('/api/audit/export').send({});
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/audit/export').send({});
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('EXPORT_RATE_LIMITED');
  });
});
