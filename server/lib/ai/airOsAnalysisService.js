const { AppError } = require('../apiResponse');
const geminiClient = require('./geminiClient');
const cooldown = require('./airOsCooldown');
const aiUsageRepo = require('../../db/repos/aiUsageRepo');
const aiAnalysisRepo = require('../../db/repos/aiAnalysisRepo');
const aiSnapshotRepo = require('../../db/repos/aiSnapshotRepo');
const metrics = require('../metrics');
const { snapshotRetentionDays } = require('./aiRetention');
const inFlight = new Map();

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function config() {
  return {
    globalDailyRequests: positiveNumber(process.env.GEMINI_DAILY_REQUEST_BUDGET, 20),
    workspaceDailyRequests: positiveNumber(process.env.GEMINI_WORKSPACE_DAILY_REQUEST_BUDGET, 10),
    globalDailyTokens: positiveNumber(process.env.GEMINI_DAILY_TOKEN_BUDGET, 150000),
    deviceCacheTtlMs: positiveNumber(process.env.GEMINI_DEVICE_CACHE_TTL_MS, 5 * 60 * 1000),
    networkCacheTtlMs: positiveNumber(process.env.GEMINI_NETWORK_CACHE_TTL_MS, 10 * 60 * 1000),
    snapshotRetentionDays: snapshotRetentionDays(),
  };
}

function providerError(error) {
  if (error instanceof AppError) return error;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    return new AppError('Gemini tardó demasiado en responder', 504, 'AI_TIMEOUT');
  }
  if (error?.status === 429 || error?.code === 429 || error?.code === 'RESOURCE_EXHAUSTED') {
    return new AppError('Gemini alcanzó temporalmente su límite gratuito', 429, 'AI_RATE_LIMITED');
  }
  if (error?.code === 'AI_NOT_CONFIGURED') {
    return new AppError('Gemini no está configurado o está deshabilitado', 503, 'AI_NOT_CONFIGURED');
  }
  if (error?.code === 'AI_INVALID_RESPONSE' || error?.name === 'ZodError') {
    return new AppError('Gemini devolvió una respuesta que no se pudo validar', 502, 'AI_INVALID_RESPONSE');
  }
  if (error?.code === 'AI_POLICY_REJECTED') {
    return new AppError('La respuesta de Gemini fue descartada por la política consultiva', 502, 'AI_POLICY_REJECTED');
  }
  return new AppError('No fue posible completar el análisis con Gemini', 502, 'AI_PROVIDER_ERROR');
}

function normalizeNetworkAnalysis(analysis, type) {
  if (type !== 'NETWORK' || !analysis?.findings) return analysis;
  return {
    ...analysis,
    findings: analysis.findings.flatMap(finding => finding.deviceIds.map(deviceId => ({
      ...finding,
      title: `${finding.title} · ${deviceId}`,
      deviceIds: [deviceId],
    }))).slice(0, 10),
  };
}

async function analyzeOnce({ workspaceId, userId, type, dto, snapshotDevices, hash, promptVersion, scope }) {
  if (!geminiClient.configured()) throw providerError({ code: 'AI_NOT_CONFIGURED' });
  const settings = config();
  const ttlMs = type === 'NETWORK' ? settings.networkCacheTtlMs : settings.deviceCacheTtlMs;
  const cached = await aiAnalysisRepo.findCached({ workspaceId, type, hash, promptVersion });

  if (cached) {
    const cachedAnalysis = normalizeNetworkAnalysis(cached.summary_json, type);
    const copy = await aiAnalysisRepo.createPending({
      workspaceId, userId, type, hash, promptVersion,
      model: cached.model, scope, ttlMs,
    });
    await aiAnalysisRepo.succeed(copy.id, { analysis: cachedAnalysis, usage: {}, latencyMs: 0 });
    metrics.aiCacheHitsTotal.inc({ type });
    metrics.aiRequestsTotal.inc({ type, status: 'cache', model: cached.model });
    return {
      uuid: copy.uuid,
      analysis: cachedAnalysis,
      cached: true,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: cached.model,
      createdAt: copy.created_at,
    };
  }

  const cooldownState = cooldown.acquire(userId);
  if (!cooldownState.acquired) {
    throw new AppError(
      `Espera ${cooldownState.retryAfterSeconds} segundos antes de solicitar otro análisis`,
      429,
      'AI_COOLDOWN',
      { retryAfterSeconds: cooldownState.retryAfterSeconds }
    );
  }

  let run;
  let quotaReserved = false;
  const startedAt = Date.now();
  try {
    run = await aiAnalysisRepo.createPending({
      workspaceId, userId, type, hash, promptVersion,
      model: geminiClient.model(), scope, ttlMs,
    });
    const devices = snapshotDevices || (type === 'NETWORK' ? dto.devices : [dto]);
    await aiSnapshotRepo.insertMany({
      workspaceId,
      analysisRunId: run.id,
      devices,
      capturedAt: Number(scope.snapshotAt) || startedAt,
      retentionDays: settings.snapshotRetentionDays,
    });
    quotaReserved = await aiUsageRepo.reserve({
      workspaceId,
      globalLimit: settings.globalDailyRequests,
      workspaceLimit: settings.workspaceDailyRequests,
      globalTokenLimit: settings.globalDailyTokens,
    });
    if (!quotaReserved) {
      cooldown.release(userId, cooldownState.acquiredAt);
      await aiAnalysisRepo.fail(run.id, { code: 'AI_DAILY_LIMIT', latencyMs: Date.now() - startedAt });
      throw new AppError('Se alcanzó el presupuesto diario configurado para Gemini', 429, 'AI_DAILY_LIMIT');
    }

    const result = await geminiClient.generateAnalysis({ kind: type, dto });
    const analysis = normalizeNetworkAnalysis(result.analysis, type);
    const latencyMs = Date.now() - startedAt;
    await aiAnalysisRepo.succeed(run.id, { analysis, usage: result.usage, latencyMs });
    // El resultado ya es válido y persistido. Un fallo posterior de telemetría
    // no debe convertir artificialmente el análisis en FAILED ni repetirlo.
    await aiUsageRepo.recordResult({ workspaceId, ...result.usage }).catch(() => {});
    metrics.aiRequestsTotal.inc({ type, status: 'ok', model: result.model });
    metrics.aiLatencySeconds.observe({ type, model: result.model }, latencyMs / 1000);
    metrics.aiTokensTotal.inc({ direction: 'input', type, model: result.model }, result.usage.inputTokens);
    metrics.aiTokensTotal.inc({ direction: 'output', type, model: result.model }, result.usage.outputTokens);
    return {
      uuid: run.uuid,
      analysis,
      cached: false,
      usage: result.usage,
      model: result.model,
      createdAt: run.created_at,
    };
  } catch (error) {
    const normalized = providerError(error);
    const metricModel = geminiClient.model();
    metrics.aiRequestsTotal.inc({ type, status: 'error', model: metricModel });
    if (normalized.code === 'AI_POLICY_REJECTED' || normalized.code === 'AI_INVALID_RESPONSE') {
      metrics.aiRejectionsTotal.inc({ reason: normalized.code });
    }
    if (run && normalized.code !== 'AI_DAILY_LIMIT') {
      await aiAnalysisRepo.fail(run.id, { code: normalized.code, latencyMs: Date.now() - startedAt }).catch(() => {});
    }
    if (quotaReserved) {
      await aiUsageRepo.recordResult({ workspaceId, failed: true }).catch(() => {});
    } else {
      cooldown.release(userId, cooldownState.acquiredAt);
    }
    throw normalized;
  }
}

async function analyze(params) {
  const key = `${params.workspaceId}:${params.type}:${params.hash}:${params.promptVersion}`;
  const existing = inFlight.get(key);
  if (existing) {
    await existing;
    // El líder ya persistió el resultado; esta segunda pasada cae en caché y
    // crea un UUID de historial propio sin reservar cuota ni consumir tokens.
    return analyzeOnce(params);
  }
  const operation = analyzeOnce(params);
  inFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (inFlight.get(key) === operation) inFlight.delete(key);
  }
}

function resetForTests() { inFlight.clear(); }

module.exports = { analyze, config, providerError, resetForTests };
