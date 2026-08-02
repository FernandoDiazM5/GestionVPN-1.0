const express = require('express');
const crypto = require('crypto');
const {
  SecurityStepUpRequestSchema, SecurityMutationSchema, SecurityHistoryQuerySchema,
  AccountUnlockMutationSchema,
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
const accountSecurityRepo = require('../db/repos/accountLoginSecurityRepo');
const memberRepo = require('../db/repos/memberRepo');
const telegram = require('../lib/telegram');
const {
  callSecurityAgent, getSecurityAgentStatus, invalidateSecurityAgentStatus,
} = require('../lib/securityAgentClient');
const { clientIp, guardPolicy, clearLoginIdentityBlocks } = require('../lib/rateLimit');
const webObservation = require('../lib/webSecurityObservation');
const webEnforcement = require('../lib/webSecurityEnforcement');
const { systemTrustedCidrs } = require('../lib/webSecurityTrustedSources');
const webEnforcementRepo = require('../db/repos/webSecurityEnforcementRepo');

const router = express.Router();
router.use(requireSession);
router.use(asyncHandler(async (req, _res, next) => {
  if (req.account.platform_admin) {
    await webEnforcement.touchAdminIp({ sourceIp: clientIp(req), userId: req.account.sub });
  }
  next();
}));
const STEP_UP_MS = 5 * 60 * 1000;
const DURATION_JAIL = {
  '15m': 'gestionvpn-15m', '1h': 'gestionvpn-1h', '6h': 'gestionvpn-6h',
  '24h': 'gestionvpn-24h', '7d': 'gestionvpn-7d', indefinite: 'gestionvpn-indefinite',
};

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function requireSecurityOperator(req, res, next) {
  if (req.account.platform_admin || req.account.role === 'OWNER') return next();
  return res.status(403).json({ success: false, code: 'SECURITY_OPERATOR_REQUIRED',
    message: 'Permisos insuficientes' });
}

async function notifyAdmin(userId, action, target, reason) {
  try {
    const sub = await notificationRepo.getByUser(userId);
    if (!sub?.telegram_chat_id) return { skipped: true };
    const escape = (value) => String(value).replace(/[&<>]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[char]);
    return telegram.sendMessage({ chatId: sub.telegram_chat_id,
      text: `<b>Seguridad VPS</b>\nAcción: <code>${escape(action)}</code>\nObjetivo: <code>${escape(target)}</code>\nMotivo: ${escape(reason)}` });
  } catch (error) { return { ok: false, error: error.message }; }
}

router.post('/step-up', requireSecurityOperator, guardPolicy('SECURITY_STEP_UP'), validate({ body: SecurityStepUpRequestSchema }), asyncHandler(async (req, res) => {
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
    invalidateSecurityAgentStatus();
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

async function readSecurityStatus() {
  try {
    return await getSecurityAgentStatus();
  } catch (error) {
    const timeout = error?.code === 'SECURITY_AGENT_TIMEOUT';
    throw new AppError(
      timeout
        ? 'La seguridad del VPS está tardando más de lo esperado. Vuelve a intentarlo.'
        : 'No se pudo consultar temporalmente la seguridad del VPS.',
      503,
      timeout ? 'SECURITY_AGENT_TIMEOUT' : 'SECURITY_AGENT_UNAVAILABLE',
    );
  }
}

router.get('/status', requirePlatformAdmin, asyncHandler(async (req, res) => {
  const [agentStatus, trustedMetadata, recent, webActions] = await Promise.all([
    readSecurityStatus(), securityRepo.trustList(), securityRepo.history({ limit: 500 }),
    webEnforcementRepo.recentActions(500),
  ]);
  // The agent response is shared briefly between requests. Enrich a private copy so
  // request-specific database metadata never mutates the cached status snapshot.
  const status = structuredClone(agentStatus);
  const reasons = new Map();
  for (const row of recent) {
    if (row.outcome === 'SUCCESS' && ['BAN', 'PROMOTE_INDEFINITE'].includes(row.action)) {
      const key = `${row.jail || ''}\0${row.target}`;
      if (!reasons.has(key)) reasons.set(key, { reason: row.reason, category: row.category });
    }
  }
  for (const row of webActions) {
    if (row.status !== 'APPLIED') continue;
    const key = `${row.jail || ''}\0${row.source_ip}`;
    if (!reasons.has(key)) reasons.set(key, {
      reason: row.recommendation === 'INDEFINITE_WEB_RECIDIVISM'
        ? 'Reincidencia: 3 bloqueos web en 7 días'
        : ['gestionvpn-web-auth', 'gestionvpn-web-recidive', 'gestionvpn-indefinite'].includes(row.jail)
          ? 'Abuso de autenticación web distribuido'
          : 'Protección automática ante abuso web',
      category: 'AUTOMATIC',
    });
  }
  for (const jail of status.jails || []) {
    jail.banDetails = (jail.banDetails || []).map((detail) => ({
      ...detail,
      ...(reasons.get(`${jail.name}\0${detail.target}`) || {
        reason: jail.name === 'sshd' ? 'Fallos reiterados de autenticación SSH'
          : jail.name === 'gestionvpn-recidive' ? 'Reincidencia: 3 bloqueos SSH en 7 días'
            : ['gestionvpn-web-1h', 'gestionvpn-web-rate'].includes(jail.name) ? 'Exceso reiterado de solicitudes de autenticación'
              : jail.name === 'gestionvpn-web-auth' ? 'Abuso de autenticación web'
                : jail.name === 'gestionvpn-web-sensitive' ? 'Ataques reiterados a endpoints sensibles'
                  : jail.name === 'gestionvpn-web-recidive' ? 'Reincidencia web en siete días'
                    : jail.name === 'gestionvpn-web-scan' ? 'Primera detección de escaneo web'
                : jail.name === 'gestionvpn-web-scan-24h' ? 'Segunda detección de escaneo web'
                  : 'Bloqueo manual',
        category: ['sshd', 'gestionvpn-recidive', 'gestionvpn-web-1h',
          'gestionvpn-web-auth', 'gestionvpn-web-rate', 'gestionvpn-web-scan',
          'gestionvpn-web-scan-24h', 'gestionvpn-web-sensitive',
          'gestionvpn-web-recidive'].includes(jail.name) ? 'AUTOMATIC' : null,
      }),
    }));
  }
  return sendOk(res, { ...status, trustedMetadata, currentIp: clientIp(req),
    systemTrusted: systemTrustedCidrs() });
}));
router.get('/history', requirePlatformAdmin, validate({ query: SecurityHistoryQuerySchema }), asyncHandler(async (req, res) =>
  sendOk(res, { history: await securityRepo.history(req.query) })));
router.get('/attempts', requirePlatformAdmin, validate({ query: SecurityHistoryQuerySchema }), asyncHandler(async (req, res) =>
  sendOk(res, await callSecurityAgent('attempts', req.query))));
router.get('/web-observation', requirePlatformAdmin, validate({ query: SecurityHistoryQuerySchema }), asyncHandler(async (req, res) => {
  const [snapshot, actions] = await Promise.all([
    webObservation.observation({ sourceIp: req.query.target || null }),
    webEnforcementRepo.recentActions(100),
  ]);
  return sendOk(res, { ...snapshot, enforcement: webEnforcement.state(), actions });
}));
function blockedTargets(status) {
  return new Set((status.jails || []).flatMap((jail) =>
    (jail.banDetails || []).map((detail) => detail.target).concat(jail.banned || [])));
}

router.get('/locked-accounts', requireSecurityOperator, asyncHandler(async (req, res) => {
  const workspaceId = req.account.platform_admin ? null : req.account.workspace_id;
  const [accounts, status] = await Promise.all([
    accountSecurityRepo.listLocked(Date.now(), workspaceId),
    req.account.platform_admin ? getSecurityAgentStatus().catch(() => null) : Promise.resolve(null),
  ]);
  const globallyBlocked = status ? blockedTargets(status) : null;
  return sendOk(res, { accounts: accounts.map((account) => ({
    ...account,
    ip_globally_blocked: !account.last_failure_ip || !globallyBlocked ? null
      : globallyBlocked.has(account.last_failure_ip) || globallyBlocked.has(`${account.last_failure_ip}/32`),
  })) });
}));

router.post('/locked-accounts/unlock', requireSecurityOperator, validate({ body: AccountUnlockMutationSchema }), asyncHandler(async (req, res) => {
  await requireStepUp(req);
  const requestIp = clientIp(req);
  const user = await userRepo.findById(req.body.userId);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'NOT_FOUND');
  if (!req.account.platform_admin) {
    const membership = await memberRepo.findMembership(req.account.workspace_id, user.id);
    if (!membership) throw new AppError('Usuario no encontrado en tu workspace', 404, 'NOT_FOUND');
  }
  const lock = await accountSecurityRepo.get(user.id);
  const changed = await accountSecurityRepo.unlock(user.id);
  const clearedRateLimits = await clearLoginIdentityBlocks({
    identities: [user.email, user.name], ip: lock?.last_failure_ip,
  });
  if (lock?.last_failure_ip) {
    await webObservation.record({ eventType: 'ACCOUNT_RECOVERY', sourceIp: lock.last_failure_ip,
      userId: user.id, routeGroup: '/api/admin/security/locked-accounts/unlock', method: 'POST',
      statusCode: 200, decision: 'ADMIN_ACCOUNT_UNLOCK',
      detail: { classification: 'ADMINISTRATIVE_ACCOUNT_UNLOCK' } });
  }
  const status = req.account.platform_admin ? await getSecurityAgentStatus().catch(() => null) : null;
  const globallyBlocked = status ? blockedTargets(status) : null;
  const ipGloballyBlocked = !lock?.last_failure_ip || !globallyBlocked ? null
    : globallyBlocked.has(lock.last_failure_ip) || globallyBlocked.has(`${lock.last_failure_ip}/32`);
  await securityRepo.audit({ actorUserId: req.account.sub, action: 'ACCOUNT_UNLOCK',
    target: user.id, jail: null, category: req.body.category, reason: req.body.reason,
    outcome: 'SUCCESS', detail: { email: user.email, changed, clearedRateLimits,
      lastFailureIp: lock?.last_failure_ip || null, ipGloballyBlocked }, requestIp });
  const telegramResult = await notifyAdmin(req.account.sub, 'ACCOUNT_UNLOCK', user.email, req.body.reason);
  return sendOk(res, { unlocked: changed, clearedRateLimits,
    lastFailureIp: lock?.last_failure_ip || null, ipGloballyBlocked, telegram: telegramResult });
}));

router.post('/ban', requirePlatformAdmin, validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  if (!req.body.duration) throw new AppError('Duración requerida', 400, 'DURATION_REQUIRED');
  return sendOk(res, await mutate(req, 'ban', { target: req.body.target,
    jail: DURATION_JAIL[req.body.duration], requestIp: clientIp(req) }));
}));
router.post('/unban', requirePlatformAdmin, validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  if (!req.body.jail) throw new AppError('Jail requerido', 400, 'JAIL_REQUIRED');
  return sendOk(res, await mutate(req, 'unban', { target: req.body.target, jail: req.body.jail }));
}));
router.post('/make-indefinite', requirePlatformAdmin, validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
  if (!req.body.jail || req.body.jail === DURATION_JAIL.indefinite)
    throw new AppError('Jail temporal requerido', 400, 'SOURCE_JAIL_REQUIRED');
  if (req.body.confirmIndefinite !== true)
    throw new AppError('Confirma expresamente el bloqueo indefinido', 400, 'CONFIRM_INDEFINITE');
  return sendOk(res, await mutate(req, 'promote_indefinite', {
    target: req.body.target, sourceJail: req.body.jail,
    jail: DURATION_JAIL.indefinite, requestIp: clientIp(req),
  }));
}));
router.post('/trust', requirePlatformAdmin, validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
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
router.delete('/trust', requirePlatformAdmin, validate({ body: SecurityMutationSchema }), asyncHandler(async (req, res) => {
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
