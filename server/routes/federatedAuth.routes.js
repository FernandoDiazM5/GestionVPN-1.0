const express = require('express');
const { FederatedExchangeRequestSchema } = require('@gestionvpn/contracts');
const { AppError, asyncHandler, sendOk } = require('../lib/apiResponse');
const { readFederatedAuthConfig } = require('../lib/federatedAuthConfig');
const { verifyFirebaseIdToken } = require('../lib/firebaseIdentityProvider');
const { issueSession } = require('../lib/sessionService');
const { setSessionCookie } = require('../lib/jwt');
const authIdentityRepo = require('../db/repos/authIdentityRepo');
const rateLimit = require('../lib/rateLimit');
const {
  issueFederatedCsrf,
  clearFederatedCsrf,
  requireFederatedCsrf,
} = require('../middleware/federatedCsrf');
const log = require('../lib/logger').child({ scope: 'federated-auth' });

const router = express.Router();
const GENERIC_BAD_CREDENTIALS = 'Correo o contraseña incorrectos';

function requirePilotEnabled(_req, _res, next) {
  if (!readFederatedAuthConfig().enabled) {
    return next(new AppError('Ruta no disponible', 404, 'FEDERATED_AUTH_DISABLED'));
  }
  next();
}

function denyLogin(reason) {
  log.warn({ reason }, 'Intercambio de identidad rechazado');
  throw new AppError(GENERIC_BAD_CREDENTIALS, 401, 'BAD_CREDENTIALS');
}

router.use(requirePilotEnabled);

// Bootstrap de doble envio: la cookie es HttpOnly y el valor se devuelve al SPA.
router.get('/csrf', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  return sendOk(res, {
    provider: 'firebase',
    csrfToken: issueFederatedCsrf(res),
  });
});

router.post(
  '/exchange',
  requireFederatedCsrf,
  rateLimit.guardPolicy('FEDERATED_EXCHANGE'),
  asyncHandler(async (req, res) => {
    const { idToken } = FederatedExchangeRequestSchema.parse(req.body);
    let identity;
    try {
      identity = await verifyFirebaseIdToken(idToken);
    } catch (error) {
      log.warn({ code: error?.code || 'VERIFY_FAILED' }, 'Firebase rechazo el token');
      return denyLogin('provider_rejected');
    }

    const context = await authIdentityRepo.findLoginContext(identity);
    if (!context) return denyLogin('identity_unlinked');
    if (context.deleted_at || context.disabled_at || Number(context.email_verified) !== 1) {
      return denyLogin('local_user_inactive');
    }
    if (!context.workspace_id || !context.role || !context.workspace_name) {
      return denyLogin('local_membership_inactive');
    }
    if (String(context.email).trim().toLowerCase() !== identity.email) {
      return denyLogin('email_mismatch');
    }

    const marked = await authIdentityRepo.markVerified(identity);
    if (!marked) return denyLogin('identity_changed');

    const platformAdmin = Number(context.is_platform_admin) === 1;
    const { token } = await issueSession({
      sub: context.user_id,
      email: context.email,
      workspace_id: context.workspace_id,
      role: context.role,
      platform_admin: platformAdmin,
    });
    setSessionCookie(res, token);
    clearFederatedCsrf(res);

    return sendOk(res, {
      user: {
        id: context.user_id,
        email: context.email,
        name: context.name,
        role: context.role,
        workspace_id: context.workspace_id,
        workspace_name: context.workspace_name,
        platform_admin: platformAdmin,
      },
    });
  }),
);

module.exports = router;
