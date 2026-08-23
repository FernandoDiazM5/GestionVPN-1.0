const express = require('express');
const { z } = require('zod');
const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { inspectCore, previewProvision, provisionCore } = require('../lib/coreServerService');
const { getLastBackup, loadConfig, runCoreBackup } = require('../lib/coreBackupService');
const coreProvisionRepo = require('../db/repos/coreProvisionRepo');
const { getAppSetting } = require('../db.service');

const router = express.Router();
const CONFIRMATION = 'PREPARAR DESDE CERO';

function asAppError(error) {
  const map = {
    CORE_PROVISION_BLOCKED: [409, 'CORE_PROVISION_BLOCKED'],
    BACKUP_IN_PROGRESS: [409, 'BACKUP_IN_PROGRESS'],
    CORE_NOT_CONFIGURED: [400, 'CORE_NOT_CONFIGURED'],
    BACKUP_PASSWORD_REQUIRED: [400, 'BACKUP_PASSWORD_REQUIRED'],
    ADMIN_EMAIL_REQUIRED: [400, 'ADMIN_EMAIL_REQUIRED'],
    BACKUP_EMAIL_FAILED: [503, 'BACKUP_EMAIL_FAILED'],
  };
  const [status, code] = map[error?.code] || [502, error?.code || 'CORE_OPERATION_FAILED'];
  return new AppError(error?.message || 'No se pudo completar la operación sobre el servidor VPN.', status, code, error?.preview ? { preview: error.preview } : null);
}

router.get('/status', asyncHandler(async (_req, res) => {
  const [health, lastBackup, config] = await Promise.all([inspectCore(), getLastBackup(), loadConfig()]);
  return sendOk(res, {
    health,
    backup: {
      enabled: config.enabled,
      time: config.time,
      timeZone: config.timeZone,
      passwordConfigured: config.backupPassword.length >= 12,
      last: lastBackup,
    },
  });
}));

router.post('/health', asyncHandler(async (_req, res) => sendOk(res, { health: await inspectCore() })));

router.get('/provision-preview', asyncHandler(async (_req, res) => {
  try {
    return sendOk(res, { preview: await previewProvision(), confirmation: CONFIRMATION });
  } catch (error) {
    throw asAppError(error);
  }
}));

router.get('/provision-history', asyncHandler(async (_req, res) => {
  return sendOk(res, { runs: await coreProvisionRepo.history(20) });
}));

router.post('/provision', asyncHandler(async (req, res) => {
  const body = z.object({ confirmation: z.literal(CONFIRMATION) }).parse(req.body);
  if (body.confirmation !== CONFIRMATION) throw new AppError('Confirmación inválida.', 422, 'INVALID_CONFIRMATION');
  const preview = await previewProvision();
  const runId = await coreProvisionRepo.start({
    actorUserId: req.account?.sub,
    targetHost: preview.summary?.host || await getAppSetting('MT_IP'),
    targetIdentity: preview.summary?.identity,
    targetVersion: preview.summary?.version,
    targetModel: preview.summary?.model,
    networkSupernet: await getAppSetting('management_supernet'),
  });
  if (!preview.canProvision) {
    await coreProvisionRepo.finish(runId, { status: 'BLOCKED', steps: [], errorCode: 'CORE_PROVISION_BLOCKED', errorMessage: preview.blockers.join(' ') });
    throw asAppError(Object.assign(new Error(preview.blockers.join(' ')), { code: 'CORE_PROVISION_BLOCKED', preview }));
  }
  try {
    const result = await provisionCore();
    await coreProvisionRepo.finish(runId, { status: 'COMPLETED', steps: result.steps, identity: result.health?.identity });
    return sendOk(res, { result: { ...result, runId } });
  } catch (error) {
    await coreProvisionRepo.finish(runId, { status: 'FAILED', steps: error.steps || [], errorCode: error.code || 'CORE_OPERATION_FAILED', errorMessage: error.message });
    throw asAppError(error);
  }
}));

router.post('/backup-now', asyncHandler(async (_req, res) => {
  try {
    return sendOk(res, { result: await runCoreBackup('manual') });
  } catch (error) {
    throw asAppError(error);
  }
}));

module.exports = router;
