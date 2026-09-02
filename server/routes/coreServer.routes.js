const express = require('express');
const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { inspectCore } = require('../lib/coreServerService');
const { getLastBackup, loadConfig, runCoreBackup } = require('../lib/coreBackupService');

const router = express.Router();

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

router.post('/backup-now', asyncHandler(async (_req, res) => {
  try {
    return sendOk(res, { result: await runCoreBackup('manual') });
  } catch (error) {
    throw asAppError(error);
  }
}));

module.exports = router;
