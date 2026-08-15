'use strict';

const express = require('express');
const { z } = require('zod');
const { COOKIE_NAME, createAdminAuth } = require('./middleware/adminAuth');
const { createAdminSessionService } = require('./services/adminSessions');
const { createAdminService } = require('./services/adminService');
const { activateInstance } = require('./services/activateInstance');
const { createLicenseLifecycleService } = require('./services/licenseLifecycle');
const { createInstanceAuth } = require('./middleware/instanceAuth');
const { syncInstance } = require('./services/instanceSync');

const uuid = z.string().uuid();
const customerSchema = z.object({
  legalName: z.string().trim().min(2).max(180),
  displayName: z.string().trim().min(2).max(120),
  taxId: z.string().trim().max(40).optional(),
}).strict();
const planSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  entitlements: z.array(z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_.-]{1,99}$/),
    enabled: z.boolean(),
    limit: z.number().int().nonnegative().nullable().optional(),
  }).strict()).max(100).default([]),
}).strict();
const instanceSchema = z.object({
  customerId: uuid,
  subdomainLabel: z.string().trim().min(3).max(63).optional(),
  publicIp: z.union([z.ipv4(), z.ipv6()]).optional(),
}).strict();
const activationSchema = z.object({ ttlHours: z.number().int().min(1).max(72).default(24) }).strict();
const subscriptionSchema = z.object({
  planId: uuid,
  status: z.enum(['TRIAL', 'ACTIVE']),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
}).strict();
const publicActivationSchema = z.object({
  code: z.string().trim().min(20).max(100),
  instancePublicKeyPem: z.string().trim().min(80).max(1000),
}).strict();
const signingKeySchema = z.object({
  keyId: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,80}$/),
  publicKeyPem: z.string().trim().min(80).max(1000),
  activate: z.boolean().default(false),
}).strict();
const revokeSchema = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
const signingKeyIdSchema = z.string().regex(/^[a-zA-Z0-9._-]{3,80}$/);
const loginBase = { email: z.email().max(254), password: z.string().min(12).max(200) };
const loginSchema = z.union([
  z.object({ ...loginBase, totp: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ ...loginBase, recoveryCode: z.string().trim().min(20).max(40) }).strict(),
]);
const reauthSchema = z.object({ password: z.string().min(12).max(200), totp: z.string().regex(/^\d{6}$/) }).strict();
const instanceSyncSchema = z.object({
  softwareVersion: z.string().trim().min(1).max(50).optional(),
  requestLicense: z.boolean().default(false),
  licenseReason: z.enum(['RENEWAL', 'MISSING']).optional(),
}).strict().superRefine((value, context) => {
  if (value.requestLicense !== Boolean(value.licenseReason)) context.addIssue({ code:'custom', path:['licenseReason'], message:'Debe acompañar exactamente a requestLicense.' });
});

function validate(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const error = new Error('VALIDATION_ERROR');
    error.code = 'VALIDATION_ERROR';
    error.issues = parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
    throw error;
  }
  return parsed.data;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function createApp({ pool, activationPepper, rateLimitPepper, signingKeyId, signingPrivateKey,
  adminMfaEncryptionKey, adminSessionPepper, now }) {
  const app = express();
  const service = createAdminService({ pool, activationPepper, now });
  const licenseLifecycle = createLicenseLifecycleService({ pool, now });
  const sessions = createAdminSessionService({ pool, mfaEncryptionKey: adminMfaEncryptionKey,
    sessionPepper: adminSessionPepper, now });
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
  app.post('/api/admin-auth/login', asyncRoute(async (req, res) => {
    const input = validate(loginSchema, req.body);
    const session = await sessions.login({ ...input, sourceIp: req.ip, userAgent: req.get('user-agent') || '' });
    res.cookie(COOKIE_NAME, session.token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', expires: session.expiresAt });
    res.json({ success: true, csrfToken: session.csrf, admin: session.admin, expiresAt: session.expiresAt });
  }));
  if (rateLimitPepper && signingKeyId && signingPrivateKey) app.post('/api/activate', asyncRoute(async (req, res) => {
    const input = validate(publicActivationSchema, req.body);
    const activation = await activateInstance({ pool, ...input, activationPepper, rateLimitPepper,
      sourceIp: req.ip, signingKeyId, signingPrivateKey, now: now?.() || new Date() });
    res.status(201).json({ success: true, activation });
  }));
  if (signingKeyId && signingPrivateKey) app.post('/api/instance/sync', createInstanceAuth({ pool, now }), asyncRoute(async (req, res) => {
    const input = validate(instanceSyncSchema, req.body || {});
    const sync = await syncInstance({ pool, instanceId:req.instance.id, ...input, signingKeyId, signingPrivateKey, now:now?.() || new Date() });
    res.json({ success:true, sync });
  }));

  const admin = express.Router();
  admin.use(createAdminAuth({ pool, now }));
  admin.get('/me', (req, res) => res.json({ success: true, admin: req.admin }));
  admin.post('/logout', asyncRoute(async (req, res) => {
    await sessions.logout(req.adminSessionId);
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
    res.json({ success: true });
  }));
  admin.post('/recovery-codes/regenerate', asyncRoute(async (req, res) => {
    const codes = await sessions.regenerateRecoveryCodes(req.admin.id, validate(reauthSchema, req.body));
    res.json({ success: true, recoveryCodes: codes, warning: 'Estos códigos se muestran una sola vez; los anteriores ya no son válidos.' });
  }));
  admin.get('/customers', asyncRoute(async (_req, res) => res.json({ success: true, customers: await service.listCustomers() })));
  admin.post('/customers', asyncRoute(async (req, res) => res.status(201).json({ success: true, customer: await service.createCustomer(validate(customerSchema, req.body)) })));
  admin.get('/plans', asyncRoute(async (_req, res) => res.json({ success: true, plans: await service.listPlans() })));
  admin.post('/plans', asyncRoute(async (req, res) => res.status(201).json({ success: true, plan: await service.createPlan(validate(planSchema, req.body)) })));
  admin.get('/instances', asyncRoute(async (_req, res) => res.json({ success: true, instances: await service.listInstances() })));
  admin.post('/instances', asyncRoute(async (req, res) => res.status(201).json({ success: true, instance: await service.createInstance(validate(instanceSchema, req.body)) })));
  admin.get('/instances/:id/activation-codes', asyncRoute(async (req, res) => res.json({ success: true, activations: await service.listActivations(validate(uuid, req.params.id)) })));
  admin.post('/instances/:id/activation-codes', asyncRoute(async (req, res) => {
    const input = validate(activationSchema, req.body || {});
    const activation = await service.issueActivation(validate(uuid, req.params.id), req.admin.id, input.ttlHours);
    res.status(201).json({ success: true, activation, warning: 'El código sólo se mostrará en esta respuesta.' });
  }));
  admin.post('/instances/:id/subscriptions', asyncRoute(async (req, res) => res.status(201).json({
    success: true,
    subscription: await service.assignSubscription(validate(uuid, req.params.id), validate(subscriptionSchema, req.body)),
  })));
  admin.post('/activation-codes/:id/revoke', asyncRoute(async (req, res) => res.json({ success: true, activation: await service.revokeActivation(validate(uuid, req.params.id)) })));
  admin.get('/license-keys', asyncRoute(async (_req, res) => res.json({ success: true, keys: await licenseLifecycle.listSigningKeys() })));
  admin.post('/license-keys', asyncRoute(async (req, res) => res.status(201).json({
    success: true, key: await licenseLifecycle.registerSigningKey(validate(signingKeySchema, req.body)),
  })));
  admin.post('/license-keys/:keyId/activate', asyncRoute(async (req, res) => res.json({
    success: true, key: await licenseLifecycle.activateSigningKey(validate(signingKeyIdSchema, req.params.keyId)),
    warning: 'La emisión requiere instalar fuera de la API el archivo privado correspondiente y configurar su keyId.',
  })));
  admin.post('/license-keys/:keyId/revoke', asyncRoute(async (req, res) => {
    validate(revokeSchema, req.body);
    res.json({ success: true, key: await licenseLifecycle.revokeSigningKey(validate(signingKeyIdSchema, req.params.keyId)) });
  }));
  admin.get('/instances/:id/licenses', asyncRoute(async (req, res) => res.json({
    success: true, licenses: await licenseLifecycle.listLicenses(validate(uuid, req.params.id)),
  })));
  admin.post('/licenses/:id/revoke', asyncRoute(async (req, res) => {
    const input = validate(revokeSchema, req.body);
    res.json({ success: true, license: await licenseLifecycle.revokeLicense(validate(uuid, req.params.id), input.reason) });
  }));
  app.use('/api/admin', admin);

  app.use((error, _req, res, _next) => {
    const duplicate = error?.code === 'ER_DUP_ENTRY';
    const publicActivationFailure = /^(ACTIVATION_CODE_|INSTANCE_ALREADY_ACTIVATED|SUBSCRIPTION_NOT_ACTIVE)/.test(error?.code || '');
    const status = ['ACTIVATION_RATE_LIMITED', 'ADMIN_LOGIN_RATE_LIMITED'].includes(error?.code) ? 429
      : ['ADMIN_LOGIN_FAILED', 'ADMIN_REAUTH_FAILED', 'INSTANCE_AUTH_FAILED'].includes(error?.code) ? 401
      : publicActivationFailure ? 400 : error?.code === 'VALIDATION_ERROR' ? 400
      : duplicate || /(_NOT_FOUND|_ALREADY_|_NOT_REVOCABLE|_NOT_ACTIVATABLE|_TOO_EARLY|_INCOMPLETE|_EXHAUSTED)$/.test(error?.code || '') ? 409
        : 500;
    const code = duplicate ? 'RESOURCE_CONFLICT' : publicActivationFailure ? 'ACTIVATION_FAILED' : status === 500 ? 'INTERNAL_ERROR' : error.code;
    if (error?.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
    res.status(status).json({ success: false, code, ...(error.issues ? { issues: error.issues } : {}) });
  });
  return app;
}

module.exports = { createApp };
