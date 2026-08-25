const express = require('express');
const {
  AIR_OS_AI_POLICY_VERSION,
  AirOsAiConsentRequestSchema,
  AirOsAiDeviceAnalysisRequestSchema,
  AirOsAiDeviceHistoryRequestSchema,
  AirOsAiNetworkAnalysisRequestSchema,
  AirOsAiAnalysesQuerySchema,
  AnalysisUuidParamsSchema,
} = require('@gestionvpn/contracts');
const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { requireOwner, requireAiAccess, requireAiConsent } = require('../lib/ai/aiGuards');
const geminiClient = require('../lib/ai/geminiClient');
const aiAccessRepo = require('../db/repos/aiAccessRepo');
const aiConsentRepo = require('../db/repos/aiConsentRepo');
const aiUsageRepo = require('../db/repos/aiUsageRepo');
const aiAnalysisRepo = require('../db/repos/aiAnalysisRepo');
const analysisService = require('../lib/ai/airOsAnalysisService');
const { buildDeviceDto, buildNetworkDto, deviceFingerprint, snapshotHash } = require('../lib/ai/airOsDto');
const { analysisRetentionDays, historyCutoff } = require('../lib/ai/aiRetention');
const { PROMPT_VERSION } = require('../lib/ai/airOsPrompt');
const { validate } = require('../middleware/validate');
const integrations = require('../lib/workspaceIntegrationService');
const platformIntegrations = require('../lib/platformIntegrationService');

const router = express.Router();
router.use(requireOwner);

function limits() {
  return {
    dailyRequests: Number(process.env.GEMINI_DAILY_REQUEST_BUDGET || 20),
    workspaceDailyRequests: Number(process.env.GEMINI_WORKSPACE_DAILY_REQUEST_BUDGET || 10),
    dailyTokens: Number(process.env.GEMINI_DAILY_TOKEN_BUDGET || 150000),
    maxDevicesPerNetwork: Math.min(100, Number(process.env.GEMINI_MAX_DEVICES_PER_NETWORK || 100)),
    maxInputBytes: Number(process.env.GEMINI_MAX_INPUT_BYTES || 60000),
  };
}

function ensurePayloadSize(body) {
  const actualBytes = Buffer.byteLength(JSON.stringify(body || {}), 'utf8');
  const maximumBytes = limits().maxInputBytes;
  if (actualBytes > maximumBytes) {
    throw new AppError(
      `Los datos seleccionados ocupan ${actualBytes} bytes; el máximo es ${maximumBytes}`,
      413,
      'AI_PAYLOAD_TOO_LARGE',
      { actualBytes, maximumBytes }
    );
  }
}

async function ensureConfigured(workspaceId) {
  const workspaceGemini = await integrations.getSecret(workspaceId, 'GEMINI').catch(() => null);
  const platformGemini = workspaceGemini ? null : await platformIntegrations.getSecret('GEMINI').catch(() => null);
  if (!geminiClient.configured((workspaceGemini || platformGemini)?.apiKey)) {
    throw new AppError('Gemini no está configurado o está deshabilitado', 503, 'AI_NOT_CONFIGURED');
  }
}

router.get('/status', asyncHandler(async (req, res) => {
  const [access, consentAccepted, usage, workspaceGemini, platformGemini] = await Promise.all([
    aiAccessRepo.getForUser(req.account.sub),
    aiConsentRepo.get(req.account.sub, AIR_OS_AI_POLICY_VERSION),
    aiUsageRepo.get(`workspace:${req.account.workspace_id}`),
    integrations.getSecret(req.account.workspace_id, 'GEMINI').catch(() => null),
    platformIntegrations.getSecret('GEMINI').catch(() => null),
  ]);
  const effectiveGemini = workspaceGemini || platformGemini;
  return sendOk(res, {
    status: {
      configured: geminiClient.configured(effectiveGemini?.apiKey),
      enabled: Boolean(effectiveGemini?.apiKey) || process.env.GEMINI_AI_ENABLED === 'true',
      model: effectiveGemini?.model || (process.env.GEMINI_API_KEY ? geminiClient.model() : null),
      moderatorAccessEnabled: access.enabled,
      consentAccepted,
      policyVersion: AIR_OS_AI_POLICY_VERSION,
      cooldownSeconds: Number(process.env.GEMINI_USER_COOLDOWN_SECONDS || 60),
      limits: limits(),
      usage: {
        requestCount: Number(usage.request_count || 0),
        totalTokens: Number(usage.total_tokens || 0),
      },
    },
  });
}));

router.post('/consent', requireAiAccess, asyncHandler(async (req, res) => {
  const input = AirOsAiConsentRequestSchema.parse(req.body);
  await aiConsentRepo.set({ userId: req.account.sub, policyVersion: input.policyVersion, accepted: input.accepted });
  return sendOk(res, { accepted: input.accepted, policyVersion: input.policyVersion });
}));

router.post('/device-analysis', requireAiAccess, requireAiConsent, asyncHandler(async (req, res) => {
  await ensureConfigured(req.account.workspace_id);
  ensurePayloadSize(req.body);
  const input = AirOsAiDeviceAnalysisRequestSchema.parse(req.body);
  const dto = buildDeviceDto({ workspaceId: req.account.workspace_id, device: input.device });
  const hash = snapshotHash(dto, PROMPT_VERSION);
  const result = await analysisService.analyze({
    workspaceId: req.account.workspace_id,
    userId: req.account.sub,
    type: 'DEVICE',
    dto,
    hash,
    promptVersion: PROMPT_VERSION,
    scope: { snapshotAt: input.snapshotAt, deviceAlias: dto.alias, deviceId: dto.id },
  });
  return sendOk(res, { result }, result.cached ? 200 : 201);
}));

router.post('/network-analysis', requireAiAccess, requireAiConsent, asyncHandler(async (req, res) => {
  await ensureConfigured(req.account.workspace_id);
  ensurePayloadSize(req.body);
  const input = AirOsAiNetworkAnalysisRequestSchema.parse(req.body);
  const maximum = limits().maxDevicesPerNetwork;
  if (input.devices.length > maximum) {
    throw new AppError(
      `La vista contiene ${input.devices.length} equipos; el máximo configurado es ${maximum}`,
      422,
      'AI_TOO_MANY_DEVICES',
      { maximumDevices: maximum }
    );
  }
  const network = buildNetworkDto({
    workspaceId: req.account.workspace_id,
    devices: input.devices,
    snapshotAt: input.snapshotAt,
    selectedDeviceIndexes: input.selectedDeviceIndexes,
  });
  if (!network.dto.devices.length) {
    throw new AppError(
      'No hay receptores STA con riesgo suficiente seleccionados para analizar',
      422,
      'AI_NO_NETWORK_CANDIDATES'
    );
  }
  const hash = snapshotHash(network.dto, PROMPT_VERSION);
  const result = await analysisService.analyze({
    workspaceId: req.account.workspace_id,
    userId: req.account.sub,
    type: 'NETWORK',
    dto: network.dto,
    snapshotDevices: network.snapshotDevices,
    hash,
    promptVersion: PROMPT_VERSION,
    scope: {
      ...input.scope,
      snapshotAt: input.snapshotAt,
      visibleDeviceCount: input.devices.length,
      selectedDeviceCount: network.selection.devices.length,
      scoreSummary: network.selection.summary,
    },
  });
  return sendOk(res, { result: { ...result, networkSelection: network.selection } }, result.cached ? 200 : 201);
}));

router.get('/analyses', requireAiAccess, requireAiConsent, validate({ query: AirOsAiAnalysesQuerySchema }), asyncHandler(async (req, res) => {
  const { type, limit } = req.query;
  const analyses = await aiAnalysisRepo.listForUser({
    workspaceId: req.account.workspace_id, userId: req.account.sub, type,
    limit, createdAfter: historyCutoff(),
  });
  return sendOk(res, { analyses, retentionDays: analysisRetentionDays() });
}));

router.post('/analyses/device-history', requireAiAccess, requireAiConsent, asyncHandler(async (req, res) => {
  const input = AirOsAiDeviceHistoryRequestSchema.parse(req.body);
  const fingerprint = deviceFingerprint({
    workspaceId: req.account.workspace_id,
    device: input.device,
  });
  const analyses = await aiAnalysisRepo.listForUser({
    workspaceId: req.account.workspace_id,
    userId: req.account.sub,
    type: 'DEVICE',
    deviceFingerprint: fingerprint,
    createdAfter: historyCutoff(),
    limit: input.limit,
  });
  return sendOk(res, { analyses, retentionDays: analysisRetentionDays() });
}));

router.get('/analyses/:uuid', requireAiAccess, requireAiConsent, validate({ params: AnalysisUuidParamsSchema }), asyncHandler(async (req, res) => {
  const analysis = await aiAnalysisRepo.getForUser({
    workspaceId: req.account.workspace_id, userId: req.account.sub,
    uuid: req.params.uuid, createdAfter: historyCutoff(),
  });
  if (!analysis) throw new AppError('Análisis no encontrado', 404, 'NOT_FOUND');
  return sendOk(res, { analysis });
}));

router.delete('/analyses/:uuid', requireAiAccess, requireAiConsent, validate({ params: AnalysisUuidParamsSchema }), asyncHandler(async (req, res) => {
  const removed = await aiAnalysisRepo.removeForUser({
    workspaceId: req.account.workspace_id, userId: req.account.sub, uuid: req.params.uuid,
  });
  if (!removed) throw new AppError('Análisis no encontrado', 404, 'NOT_FOUND');
  return sendOk(res, { message: 'Análisis eliminado' });
}));

module.exports = router;
