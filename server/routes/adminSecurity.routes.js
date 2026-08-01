const express = require('express');
const crypto = require('crypto');
const {
  SecurityStepUpRequestSchema, SecurityMutationSchema, SecurityHistoryQuerySchema,
} = require('@gestionvpn/contracts');
const { requireSession, requirePlatformAdmin } = require('../middleware/authJwt');
const { validate } = require('../middleware/validate');
const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const { verifyPassword } = require('../lib/passwordHasher');
const { verifyFirebaseIdToken } = require('../lib/firebaseIdentityProvider');
const { readFederatedAuthConfig } = require('../lib/federatedAuthConfig');
const userRepo = require('../db/repos/userRepo');
const authIdentityRepo = require('../db/repos/authIdentityRepo');
const notificationRepo = require('../db/repos/notificationRepo');
const securityRepo = require('../db/repos/platformSecurityRepo');
const telegram = require('../lib/telegram');
const { callSecurityAgent } = require('../lib/securityAgentClient');
const { clientIp, guardPolicy } = require('../lib/rateLimit');

const router = express.Router();
router.use(requireSession, requirePlatformAdmin);
const STEP_UP_MS = 5 * 60 * 1000;
const DURATION_JAIL = {
  '15m': 'gestionvpn-15m', '1h': 'gestionvpn-1h', '6h': 'gestionvpn-6h',
  '24h': 'gestionvpn-24h', '7d': 'gestionvpn-7d', indefinite: 'gestionvpn-indefinite',
};

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function notifyAdmin(userId, action, target, reason) {
  try {
    const sub = await notificationRepo.getByUser(userId);
    if (!sub?.telegram_chat_id) return { skipped: true };
    const escape = (value) => String(value).replace(/[&<>]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[char]);
    return telegram.sendMessage({ chatId: sub.telegram_chat_id,
      text: `<b>Seguridad VPS</b>\nAcción: <code>${escape(action)}</code>\nObjetivo: <code>${escape(target)}</code>\nMotivo: ${escape(reason)}` });
  } catch (error) { return { ok: false, error: error.message }; }
}

router.post('/step-up', guardPolicy('SECURITY_STEP_UP'), validate({ body: SecurityStepUpRequestSchema }), asyncHandler(async (req, res) => {
  const user = await userRepo.findById(req.account.sub);
  if (!user) throw new AppError('Administrador no encontrado', 404, 'NOT_FOUND');
  let method;
  if (req.body.password) {
    if (!(await verifyPassword(req.body.password, user.password_hash)))
      throw new AppError('Contraseña incorrecta', 401, 'STEP_UP_FAILED');
    method = 'PASSWORD';
  } else {
    const config = (() => { try { return readFederatedAuthConfig(); } catch { return null; } })();
    const proof = await verifyFirebaseIdToken(req.body.firebaseIdToken, { requiredSignInProvider: 'google.com' })
      .catch(() => null);
    const linked = proof && config && await authIdentityRepo.findByUser({ userId: user.id,
      provider: config.provider, tenantKey: config.tenantKey });
    if (!proof || !linked || linked.provider_subject !== proof.subject)
      throw new AppError('Confirmación de Google inválida', 401, 'STEP_UP_FAILED');
    method = 'GOOGLE';
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + STEP_UP_MS;
  await securityRepo.createStepUp({ tokenHash: hash(token), userId: user.id,
    sessionJti: req.account.jti, method, expiresAt });
  return sendOk(res, { stepUpToken: token, expiresAt, method });
}));

async function requireStepUp(req) {
  const ok = await securityRepo.consumeStepUp({ tokenHash: hash(req.body.stepUpToken),
    userId: req.account.sub, sessionJti: req.account.jti });
  if (!ok) throw new AppError('Reautenticación requerida', 401, 'STEP_UP_REQUIRED');
}

async function mutate(req, operation, params, afterSuccess) {
  await requireStepUp(req);
  const input = req.body;
  const requestIp = clientIp(req);
  if (['ban', 'promote_indefinite'].includes(operation) && input.target.split('/')[0] === requestIp)
    throw new AppError('No puedes bloquear la IP de tu sesión actual', 409, 'SELF_LOCKOUT');
  if (input.duration === 'indefinite' && input.confirmIndefinite !== true)
    throw new AppError('Confirma expresamente el bloqueo indefinido', 400, 'CONFIRM_INDEFINITE');
  try {
    const result = await callSecurityAgent(operation, params);
    if (afterSuccess) await afterSuccess(result);
    await securityRepo.audit({ actorUserId: req.account.sub, action: operation.toUpperCase(),
      target: input.target, jail: params.jail, category: input.category, reason: input.reason,
      outcome: 'SUCCESS', detail: result, requestIp });
    const telegramResult = await notifyAdmin(req.account.sub, operation.toUpperCase(), input.target, input.reason);
    return { result, telegram: telegramResult };
  } catch (error) {
    await securityRepo.audit({ actorUserId: req.account.sub, action: operation.toUpperCase(),
      target: input.target, jail: params.jail, category: input.category, reason: input.reason,
      outcome: 'FAILED', detail: { code: error.code, message: error.message }, requestIp });
    throw new AppError('No se pudo aplicar la operación de seguridad', 503, 'SECURITY_AGENT_ERROR');
  }
}

router.get('/status', asyncHandler(async (req, res) => {
  const [status, trustedMetadata, recent] = await Promise.all([
    callSecurityAgent('status'), securityRepo.trustList(), securityRepo.history({ limit: 500 }),
  ]);
  const reasons = new Map();
  for (const row of recent) {
    if (row.outcome === 'SUCCESS' && ['BAN', 'PROMOTE_INDEFINITE'].includes(row.action)) {
      const key = `${row.jail || ''}\0${row.target}`;
      if (!reasons.has(key)) reasons.set(key, { reason: row.reason, category: row.category });
    }
  }
  for (const jail of status.jails || []) {
    jail.banDetails = (jail.banDetails || []).map((detail) => ({
      ...detail,
      ...(reasons.get(`${jail.name}\0${detail.target}`) || {
        reason: jail.name === 'sshd' ? 'Fallos reiterados de autenticación SSH' : 'Bloqueo manual',
        category: jail.name === 'sshd' ? 'AUTOMATIC' : null,
      }),
    }));
  }
  return sendOk(res, { ...status, trustedMetadata, currentIp: clientIp(req) });
}));
router.get('/history', validate({ query: SecurityHistoryQuerySchema }), asyncHandler(async (req, res) =>
  sendOk(res, { history: await securityRepo.history(req.query) })));
router.get('/attempts', validate({ query: SecurityHistoryQuerySchema }), asyncHandler(async (req, res) =>
  sendOk(res, await callSecurityAgent('attempts', req.query))));

router.post('/ban', validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  if (!req.body.duration) throw new AppError('Duración requerida', 400, 'DURATION_REQUIRED');
  return sendOk(res, await mutate(req, 'ban', { target: req.body.target,
    jail: DURATION_JAIL[req.body.duration], requestIp: clientIp(req) }));
}));
router.post('/unban', validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  if (!req.body.jail) throw new AppError('Jail requerido', 400, 'JAIL_REQUIRED');
  return sendOk(res, await mutate(req, 'unban', { target: req.body.target, jail: req.body.jail }));
}));
router.post('/make-indefinite', validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  if (!req.body.jail || req.body.jail === DURATION_JAIL.indefinite)
    throw new AppError('Jail temporal requerido', 400, 'SOURCE_JAIL_REQUIRED');
  if (req.body.confirmIndefinite !== true)
    throw new AppError('Confirma expresamente el bloqueo indefinido', 400, 'CONFIRM_INDEFINITE');
  return sendOk(res, await mutate(req, 'promote_indefinite', {
    target: req.body.target, sourceJail: req.body.jail,
    jail: DURATION_JAIL.indefinite, requestIp: clientIp(req),
  }));
}));
router.post('/trust', validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  if (req.body.target.includes('/') && req.body.confirmNetworkTrust !== true)
    throw new AppError('Confirma expresamente la red CIDR confiable', 400, 'CONFIRM_NETWORK_TRUST');
  const out = await mutate(req, 'trust_add', { target: req.body.target }, async (result) => {
    try {
      await securityRepo.trustAdd({ target: result.target, category: req.body.category,
        reason: req.body.reason, actorUserId: req.account.sub });
    } catch (error) {
      await callSecurityAgent('trust_remove', { target: result.target }).catch(() => null);
      throw error;
    }
  });
  return sendOk(res, out);
}));
router.delete('/trust', validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  const out = await mutate(req, 'trust_remove', { target: req.body.target }, async (result) => {
    try {
      await securityRepo.trustRemove(result.target);
    } catch (error) {
      await callSecurityAgent('trust_add', { target: result.target }).catch(() => null);
      throw error;
    }
  });
  return sendOk(res, out);
}));

module.exports = router;
