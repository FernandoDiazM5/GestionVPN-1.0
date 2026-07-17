const { AppError } = require('../apiResponse');
const aiAccessRepo = require('../../db/repos/aiAccessRepo');
const aiConsentRepo = require('../../db/repos/aiConsentRepo');
const { AIR_OS_AI_POLICY_VERSION } = require('@gestionvpn/contracts');

function requireOwner(req, _res, next) {
  if (!req.account || req.account.platform_admin || req.account.role !== 'OWNER') {
    return next(new AppError('La función de IA está disponible sólo para moderadores', 403, 'FORBIDDEN'));
  }
  return next();
}

async function requireAiAccess(req, _res, next) {
  try {
    const access = await aiAccessRepo.getForUser(req.account.sub);
    if (!access.enabled) {
      return next(new AppError('El Administrador no habilitó Gemini para esta cuenta', 403, 'AI_ACCESS_DISABLED'));
    }
    req.aiAccess = access;
    return next();
  } catch (error) { return next(error); }
}

async function requireAiConsent(req, _res, next) {
  try {
    const accepted = await aiConsentRepo.get(req.account.sub, AIR_OS_AI_POLICY_VERSION);
    if (!accepted) {
      return next(new AppError('Debes aceptar el tratamiento externo antes de usar Gemini', 403, 'AI_CONSENT_REQUIRED'));
    }
    return next();
  } catch (error) { return next(error); }
}

module.exports = { requireOwner, requireAiAccess, requireAiConsent };
