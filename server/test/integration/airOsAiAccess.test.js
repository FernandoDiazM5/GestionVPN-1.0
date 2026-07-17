import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const aiAccessRepo = { getForUser: vi.fn() };
const aiConsentRepo = { get: vi.fn(), set: vi.fn() };
const aiUsageRepo = { get: vi.fn() };
const aiAnalysisRepo = {
  listForUser: vi.fn(), getForUser: vi.fn(), removeForUser: vi.fn(),
};
const analysisService = { analyze: vi.fn() };

stubModule(__dirname, '../../db/repos/aiAccessRepo', aiAccessRepo);
stubModule(__dirname, '../../db/repos/aiConsentRepo', aiConsentRepo);
stubModule(__dirname, '../../db/repos/aiUsageRepo', aiUsageRepo);
stubModule(__dirname, '../../db/repos/aiAnalysisRepo', aiAnalysisRepo);
stubModule(__dirname, '../../lib/ai/geminiClient', {
  configured: vi.fn(() => true), model: vi.fn(() => 'gemini-test'),
});
stubModule(__dirname, '../../lib/ai/airOsAnalysisService', analysisService);

process.env.AI_PSEUDONYM_KEY = 'test-pseudonym-key';
process.env.GEMINI_AI_ENABLED = 'true';
process.env.GEMINI_API_KEY = 'test-key';

const express = require('express');
const request = require('supertest');
const routes = require('../../routes/ai.routes');
const { errorMiddleware } = require('../../lib/apiResponse');

const identities = {
  owner: { sub: 'owner-1', workspace_id: 'ws-1', role: 'OWNER', platform_admin: false },
  member: { sub: 'member-1', workspace_id: 'ws-1', role: 'MEMBER', platform_admin: false },
  platformAdmin: { sub: 'admin-1', workspace_id: 'ws-0', role: 'OWNER', platform_admin: true },
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.account = identities[req.headers['x-test-identity']]; next(); });
app.use('/api/ai/air-os', routes);
app.use(errorMiddleware);

const device = {
  ip: '10.1.1.37', mac: 'F4:92:BF:EC:B6:57', name: 'Cliente secreto',
  model: 'LiteBeam M5', firmware: 'XW.v6.1.7', role: 'sta', essid: 'SSID privado',
  cachedStats: { signal: -63, noiseFloor: -92, ccq: 99.1, txRate: 65 },
};

beforeEach(() => {
  vi.clearAllMocks();
  aiAccessRepo.getForUser.mockResolvedValue({ enabled: true });
  aiConsentRepo.get.mockResolvedValue(true);
  aiConsentRepo.set.mockResolvedValue(undefined);
  aiUsageRepo.get.mockResolvedValue({ request_count: 0, total_tokens: 0 });
  analysisService.analyze.mockResolvedValue({
    uuid: 'run-1', cached: false, model: 'gemini-test', createdAt: 1,
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    analysis: {
      summary: 'Resultado', severity: 'info', confidence: 'high', findings: [], limitations: [],
      advisoryOnly: true, actionsExecuted: [],
    },
  });
  process.env.GEMINI_MAX_INPUT_BYTES = '60000';
});

describe('control de acceso Gemini AirOS', () => {
  it.each(['member', 'platformAdmin'])('%s no puede consultar estado ni consumir IA', async identity => {
    const response = await request(app).get('/api/ai/air-os/status').set('x-test-identity', identity);
    expect(response.status).toBe(403);
    expect(aiAccessRepo.getForUser).not.toHaveBeenCalled();
    expect(analysisService.analyze).not.toHaveBeenCalled();
  });

  it('un moderador deshabilitado no llega al análisis', async () => {
    aiAccessRepo.getForUser.mockResolvedValue({ enabled: false });
    const response = await request(app).post('/api/ai/air-os/device-analysis')
      .set('x-test-identity', 'owner').send({ snapshotAt: Date.now(), device });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('AI_ACCESS_DISABLED');
    expect(analysisService.analyze).not.toHaveBeenCalled();
  });

  it('el consentimiento es obligatorio antes del análisis', async () => {
    aiConsentRepo.get.mockResolvedValue(false);
    const response = await request(app).post('/api/ai/air-os/device-analysis')
      .set('x-test-identity', 'owner').send({ snapshotAt: Date.now(), device });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('AI_CONSENT_REQUIRED');
    expect(analysisService.analyze).not.toHaveBeenCalled();
  });

  it('seudonimiza el equipo antes de invocar el servicio', async () => {
    const response = await request(app).post('/api/ai/air-os/device-analysis')
      .set('x-test-identity', 'owner').send({ snapshotAt: Date.now(), device });
    expect(response.status).toBe(201);
    const dto = analysisService.analyze.mock.calls[0][0].dto;
    expect(dto.id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(dto)).not.toContain(device.ip);
    expect(JSON.stringify(dto)).not.toContain(device.mac);
    expect(JSON.stringify(dto)).not.toContain(device.name);
    expect(JSON.stringify(dto)).not.toContain(device.essid);
    expect(dto.metrics.signal).toBe(-63);
  });

  it('rechaza campos no permitidos como contraseñas SSH', async () => {
    const response = await request(app).post('/api/ai/air-os/device-analysis')
      .set('x-test-identity', 'owner')
      .send({ snapshotAt: Date.now(), device: { ...device, sshPass: 'no-debe-pasar' } });
    expect(response.status).toBe(422);
    expect(analysisService.analyze).not.toHaveBeenCalled();
  });

  it('rechaza el payload antes de invocar el servicio cuando supera el límite interno', async () => {
    process.env.GEMINI_MAX_INPUT_BYTES = '100';
    const response = await request(app).post('/api/ai/air-os/device-analysis')
      .set('x-test-identity', 'owner').send({ snapshotAt: Date.now(), device });
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('AI_PAYLOAD_TOO_LARGE');
    expect(analysisService.analyze).not.toHaveBeenCalled();
  });
});
