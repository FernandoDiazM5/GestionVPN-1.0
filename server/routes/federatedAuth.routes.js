const express = require('express');
const {
  FederatedExchangeRequestSchema,
  FederatedLinkRequestSchema,
  FederatedUnlinkRequestSchema,
} = require('@gestionvpn/contracts');
const { AppError, asyncHandler, sendOk } = require('../lib/apiResponse');
const { readFederatedAuthConfig } = require('../lib/federatedAuthConfig');
const {
  verifyFirebaseIdToken,
  revokeFirebaseSessions,
} = require('../lib/firebaseIdentityProvider');
const { issueSession } = require('../lib/sessionService');
const { setSessionCookie } = require('../lib/jwt');
const { requireSession } = require('../middleware/authJwt');
const { verifyPassword } = require('../lib/passwordHasher');
const { getUserByUsername } = require('../db.service');
const userRepo = require('../db/repos/userRepo');
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
const GOOGLE_PROVIDER = 'google.com';

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

async function verifyCurrentPassword(account, user, password) {
  const mayUseLegacyPassword = Boolean(account.platform_admin)
    || String(user.email || '').toLowerCase().endsWith('@local.app');
  if (mayUseLegacyPassword && user.name) {
    const legacyUser = await getUserByUsername(user.name);
    if (legacyUser?.password_hash) {
      return verifyPassword(password, legacyUser.password_hash);
    }
  }
  return verifyPassword(password, user.password_hash);
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

router.get('/link-status', requireSession, asyncHandler(async (req, res) => {
  const config = readFederatedAuthConfig();
  const identity = await authIdentityRepo.findByUser({
    userId: req.account.sub,
    provider: config.provider,
    tenantKey: config.tenantKey,
  });
  const linked = Boolean(identity && !identity.disabled_at);
  res.set('Cache-Control', 'no-store');
  return sendOk(res, {
    provider: GOOGLE_PROVIDER,
    linked,
    email: linked ? identity.email_at_link : null,
    linkedAt: linked ? Number(identity.created_at) : null,
    lastVerifiedAt: linked && identity.last_verified_at
      ? Number(identity.last_verified_at)
      : null,
  });
}));

router.post(
  '/link',
  requireSession,
  rateLimit.guardPolicy('FEDERATED_LINK'),
  asyncHandler(async (req, res) => {
    const { idToken } = FederatedLinkRequestSchema.parse(req.body);
    const config = readFederatedAuthConfig();
    const user = await userRepo.findById(req.account.sub);
    if (!user || user.disabled_at || user.deleted_at || Number(user.email_verified) !== 1) {
      throw new AppError('No se pudo vincular la cuenta', 403, 'LINK_NOT_ALLOWED');
    }

    let identity;
    try {
      identity = await verifyFirebaseIdToken(idToken, {
        requiredSignInProvider: GOOGLE_PROVIDER,
      });
    } catch (error) {
      log.warn({ code: error?.code || 'VERIFY_FAILED' }, 'Google rechazó el enlace');
      throw new AppError('No se pudo verificar la cuenta de Google', 401, 'GOOGLE_VERIFY_FAILED');
    }

    const localEmail = String(user.email).trim().toLowerCase();
    if (identity.email !== localEmail) {
      throw new AppError(
        'Selecciona la cuenta de Google que usa el mismo correo de tu perfil',
        409,
        'EMAIL_MISMATCH',
      );
    }

    const [byUser, bySubject] = await Promise.all([
      authIdentityRepo.findByUser({
        userId: user.id,
        provider: config.provider,
        tenantKey: config.tenantKey,
      }),
      authIdentityRepo.findBySubject({
        provider: identity.provider,
        tenantKey: identity.tenantKey,
        subject: identity.subject,
      }),
    ]);

    if (bySubject && bySubject.user_id !== user.id) {
      throw new AppError('Esa cuenta de Google ya está vinculada', 409, 'IDENTITY_TAKEN');
    }
    if (byUser && byUser.provider_subject !== identity.subject) {
      throw new AppError('Tu perfil ya tiene otra cuenta de Google vinculada', 409, 'USER_ALREADY_LINKED');
    }

    let reactivated = false;
    if (byUser) {
      reactivated = Boolean(byUser.disabled_at);
      const updated = await authIdentityRepo.reactivate({
        id: byUser.id,
        emailAtLink: identity.email,
      });
      if (!updated) {
        throw new AppError('No se pudo actualizar el enlace de Google', 409, 'IDENTITY_CHANGED');
      }
    } else {
      try {
        await authIdentityRepo.link({
          userId: user.id,
          provider: identity.provider,
          tenantKey: identity.tenantKey,
          subject: identity.subject,
          emailAtLink: identity.email,
        });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
          throw new AppError('La cuenta de Google ya está vinculada', 409, 'IDENTITY_CONFLICT');
        }
        throw error;
      }
    }

    log.info({ userId: user.id, reactivated }, 'Cuenta Google vinculada');
    return sendOk(res, {
      linked: true,
      email: identity.email,
      message: 'Cuenta de Google vinculada correctamente',
    });
  }),
);

router.post(
  '/unlink',
  requireSession,
  rateLimit.guardPolicy('FEDERATED_LINK'),
  asyncHandler(async (req, res) => {
    const { currentPassword } = FederatedUnlinkRequestSchema.parse(req.body);
    const config = readFederatedAuthConfig();
    const user = await userRepo.findById(req.account.sub);
    if (!user || !await verifyCurrentPassword(req.account, user, currentPassword)) {
      throw new AppError('La contraseña actual es incorrecta', 401, 'BAD_CURRENT');
    }

    const identity = await authIdentityRepo.findByUser({
      userId: user.id,
      provider: config.provider,
      tenantKey: config.tenantKey,
    });
    if (!identity || identity.disabled_at) {
      return sendOk(res, { linked: false, message: 'La cuenta de Google no está vinculada' });
    }

    const disabled = await authIdentityRepo.setDisabled({ id: identity.id, disabledAt: Date.now() });
    if (!disabled) {
      throw new AppError('No se pudo desvincular la cuenta de Google', 409, 'IDENTITY_CHANGED');
    }
    await revokeFirebaseSessions(identity.provider_subject).catch((error) => {
      log.warn({ code: error?.code || 'REVOKE_FAILED', userId: user.id }, 'No se revocaron tokens Google');
    });
    log.info({ userId: user.id }, 'Cuenta Google desvinculada');
    return sendOk(res, { linked: false, message: 'Cuenta de Google desvinculada' });
  }),
);

router.post(
  '/exchange',
  requireFederatedCsrf,
  rateLimit.guardPolicy('FEDERATED_EXCHANGE'),
  asyncHandler(async (req, res) => {
    const { idToken } = FederatedExchangeRequestSchema.parse(req.body);
    let identity;
    try {
      identity = await verifyFirebaseIdToken(idToken, {
        requiredSignInProvider: GOOGLE_PROVIDER,
      });
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
        workspace_slug: context.workspace_slug,
        platform_admin: platformAdmin,
      },
    });
  }),
);

module.exports = router;
