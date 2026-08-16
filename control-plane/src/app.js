'use strict';

const express = require('express');
const path = require('path');
const { z } = require('zod');
const { COOKIE_NAME, createAdminAuth } = require('./middleware/adminAuth');
const { createAdminSessionService } = require('./services/adminSessions');
const { createAdminService } = require('./services/adminService');
const { activateInstance } = require('./services/activateInstance');
const { createLicenseLifecycleService } = require('./services/licenseLifecycle');
const { createInstanceAuth } = require('./middleware/instanceAuth');
const { syncInstance } = require('./services/instanceSync');
const { createNotificationProviderService } = require('./services/notificationProviderService');
const { createCommercialService } = require('./services/commercialService');
const { createNotificationDeliveryService } = require('./services/notificationDeliveryService');
const { customerInstallationHtml } = require('./manuals/customerInstallation');
const { createCommercialSettingsService } = require('./services/commercialSettingsService');

const uuid = z.string().uuid();
const customerSchema = z.object({
  legalName: z.string().trim().min(2).max(180),
  displayName: z.string().trim().min(2).max(120),
  taxId: z.string().trim().max(40).optional(),
  contact: z.object({
    fullName: z.string().trim().min(2).max(160),
    email: z.email().max(254),
    phone: z.string().trim().max(40).optional(),
  }).strict(),
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
  prices: z.array(z.object({
    interval: z.enum(['MONTH','YEAR']),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('PEN'),
    amount: z.number().nonnegative().max(9999999999.99),
  }).strict()).min(1).max(2).superRefine((prices,ctx)=>{
    if(new Set(prices.map(x=>x.interval)).size!==prices.length) ctx.addIssue({code:'custom',message:'No se puede repetir el ciclo de precio.'});
  }),
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
const onboardingSchema = instanceSchema.extend({
  planId: uuid,
  status: z.enum(['TRIAL', 'ACTIVE']),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  ttlHours: z.number().int().min(1).max(72).default(24),
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
const smtpConfigSchema=z.object({host:z.string().trim().min(3).max(253),port:z.number().int().min(1).max(65535),secure:z.boolean(),
  username:z.string().trim().max(254).optional(),password:z.string().min(8).max(500).optional(),fromName:z.string().trim().min(2).max(120),
  fromEmail:z.email().max(254),replyTo:z.email().max(254).optional(),enabled:z.boolean().default(true)}).strict();
const smtpSchema=z.object({config:smtpConfigSchema,reauth:reauthSchema}).strict();
const smtpTestSchema=z.object({recipient:z.email().max(254)}).strict();
const telegramConfigSchema=z.object({chatId:z.string().trim().min(2).max(80),botToken:z.string().trim().min(30).max(200).optional(),
  eventSeverity:z.enum(['ALL','WARNING','CRITICAL']).default('WARNING'),enabled:z.boolean().default(true)}).strict();
const telegramSchema=z.object({config:telegramConfigSchema,reauth:reauthSchema}).strict();
const transitionSchema=z.object({action:z.enum(['RENEW','GRANT_GRACE','SUSPEND','REACTIVATE','CANCEL']),version:z.number().int().nonnegative(),
  months:z.number().int().min(1).max(36).optional(),endsAt:z.iso.datetime().optional(),graceEndsAt:z.iso.datetime().optional(),
  reason:z.string().trim().min(8).max(500).optional()}).strict();
const invoiceSchema=z.object({instanceId:uuid,subscriptionId:uuid.optional(),planId:uuid,billingInterval:z.enum(['MONTH','YEAR','CUSTOM']),
  periodStart:z.iso.datetime(),periodEnd:z.iso.datetime(),subtotal:z.number().nonnegative(),tax:z.number().nonnegative().default(0),
  currency:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),dueAt:z.iso.datetime()}).strict();
const paymentSchema=z.object({instanceId:uuid,amount:z.number().positive(),currency:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  paymentMethod:z.string().trim().min(2).max(40),reference:z.string().trim().max(120).optional(),paidAt:z.iso.datetime(),
  evidenceUrl:z.url().max(1000).optional(),notes:z.string().trim().max(1000).optional()}).strict();
const paymentVerificationSchema=z.discriminatedUnion('confirmed',[
  z.object({confirmed:z.literal(false),reason:z.string().trim().min(8).max(500)}).strict(),
  z.object({confirmed:z.literal(true),invoiceId:uuid,amountApplied:z.number().positive()}).strict(),
]);
const commercialSettingsSchema=z.object({legalName:z.string().trim().min(2).max(180),taxId:z.string().trim().max(40).optional(),billingEmail:z.email().max(254).optional(),address:z.string().trim().max(500).optional(),invoicePrefix:z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,12}$/),defaultCurrency:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),defaultTaxPercent:z.number().min(0).max(100),invoiceDueDays:z.number().int().min(0).max(365),graceDays:z.number().int().min(0).max(90),paymentInstructions:z.string().trim().max(4000).optional(),brandName:z.string().trim().min(2).max(120),supportEmail:z.email().max(254).optional(),version:z.number().int().nonnegative()}).strict();

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
  const notificationProviders=createNotificationProviderService({pool,encryptionKey:adminMfaEncryptionKey,now});
  const commercial=createCommercialService({pool,now});
  const commercialSettings=createCommercialSettingsService({pool});
  app.locals.reconcileCommercial=()=>commercial.reconcileExpirations();
  const deliveries=createNotificationDeliveryService({pool,encryptionKey:adminMfaEncryptionKey,providers:notificationProviders,now});
  app.locals.processNotifications=()=>deliveries.processDue();
  const licenseLifecycle = createLicenseLifecycleService({ pool, now });
  const sessions = createAdminSessionService({ pool, mfaEncryptionKey: adminMfaEncryptionKey,
    sessionPepper: adminSessionPepper, now });
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
  app.get('/manual/instalacion',(_req,res)=>{res.set('Cache-Control','public,max-age=3600');res.type('html').send(customerInstallationHtml())});
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
  admin.get('/me', asyncRoute(async (req, res) => res.json({
    success: true, admin: req.admin, csrfToken: await sessions.refreshCsrf(req.adminSessionId),
  })));
  admin.post('/logout', asyncRoute(async (req, res) => {
    await sessions.logout(req.adminSessionId);
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
    res.json({ success: true });
  }));
  admin.post('/recovery-codes/regenerate', asyncRoute(async (req, res) => {
    const codes = await sessions.regenerateRecoveryCodes(req.admin.id, validate(reauthSchema, req.body));
    res.json({ success: true, recoveryCodes: codes, warning: 'Estos códigos se muestran una sola vez; los anteriores ya no son válidos.' });
  }));
  admin.get('/settings/smtp',asyncRoute(async(_req,res)=>res.json({success:true,provider:await notificationProviders.getSmtp()})));
  admin.get('/settings/commercial',asyncRoute(async(_req,res)=>res.json({success:true,settings:await commercialSettings.get()})));
  admin.put('/settings/commercial',asyncRoute(async(req,res)=>res.json({success:true,settings:await commercialSettings.save(validate(commercialSettingsSchema,req.body),req.admin.id)})));
  admin.put('/settings/smtp',asyncRoute(async(req,res)=>{const input=validate(smtpSchema,req.body);await sessions.reauthenticate(req.admin.id,input.reauth);res.json({success:true,provider:await notificationProviders.saveSmtp(input.config,req.admin.id)})}));
  admin.post('/settings/smtp/test',asyncRoute(async(req,res)=>res.json({success:true,test:await notificationProviders.testSmtp(validate(smtpTestSchema,req.body).recipient)})));
  admin.get('/settings/telegram',asyncRoute(async(_req,res)=>res.json({success:true,provider:await notificationProviders.getTelegram()})));
  admin.put('/settings/telegram',asyncRoute(async(req,res)=>{const input=validate(telegramSchema,req.body);await sessions.reauthenticate(req.admin.id,input.reauth);res.json({success:true,provider:await notificationProviders.saveTelegram(input.config,req.admin.id)})}));
  admin.post('/settings/telegram/test',asyncRoute(async(_req,res)=>res.json({success:true,test:await notificationProviders.testTelegram()})));
  admin.get('/subscriptions',asyncRoute(async(_req,res)=>res.json({success:true,subscriptions:await commercial.listSubscriptions()})));
  admin.post('/subscriptions/:id/transition',asyncRoute(async(req,res)=>res.json({success:true,subscription:await commercial.transition(validate(uuid,req.params.id),validate(transitionSchema,req.body),req.admin.id)})));
  admin.get('/invoices',asyncRoute(async(_req,res)=>res.json({success:true,invoices:await commercial.listInvoices()})));
  admin.post('/invoices',asyncRoute(async(req,res)=>res.status(201).json({success:true,invoice:await commercial.createInvoice(validate(invoiceSchema,req.body),req.admin.id)})));
  admin.post('/payments',asyncRoute(async(req,res)=>res.status(201).json({success:true,payment:await commercial.registerPayment(validate(paymentSchema,req.body),req.admin.id)})));
  admin.get('/payments',asyncRoute(async(_req,res)=>res.json({success:true,payments:await commercial.listPayments()})));
  admin.post('/payments/:id/verify',asyncRoute(async(req,res)=>res.json({success:true,payment:await commercial.verifyPayment(validate(uuid,req.params.id),validate(paymentVerificationSchema,req.body),req.admin.id)})));
  admin.get('/communications',asyncRoute(async(_req,res)=>res.json({success:true,deliveries:await deliveries.listDeliveries()})));
  admin.post('/communications/:id/retry',asyncRoute(async(req,res)=>res.json({success:true,delivery:await deliveries.retry(validate(uuid,req.params.id))})));
  admin.get('/customers', asyncRoute(async (_req, res) => res.json({ success: true, customers: await service.listCustomers() })));
  admin.post('/customers', asyncRoute(async (req, res) => res.status(201).json({ success: true, customer: await service.createCustomer(validate(customerSchema, req.body)) })));
  admin.get('/plans', asyncRoute(async (_req, res) => res.json({ success: true, plans: await service.listPlans() })));
  admin.post('/plans', asyncRoute(async (req, res) => res.status(201).json({ success: true, plan: await service.createPlan(validate(planSchema, req.body)) })));
  admin.get('/instances', asyncRoute(async (_req, res) => res.json({ success: true, instances: await service.listInstances() })));
  admin.post('/onboarding', asyncRoute(async (req, res) => {
    const result = await service.onboardInstance(validate(onboardingSchema, req.body), req.admin.id);
    let welcome;
    try { welcome=await deliveries.queueWelcome(result.instance.id,result.activation); if(welcome.queued) await deliveries.processDue(1); }
    catch (_) { welcome={queued:false,reason:'WELCOME_QUEUE_FAILED'}; }
    res.status(201).json({success:true,...result,welcome,warning:'El código sólo se mostrará en esta respuesta.'});
  }));
  admin.post('/instances', asyncRoute(async (req, res) => res.status(201).json({ success: true, instance: await service.createInstance(validate(instanceSchema, req.body)) })));
  admin.get('/instances/:id/activation-codes', asyncRoute(async (req, res) => res.json({ success: true, activations: await service.listActivations(validate(uuid, req.params.id)) })));
  admin.post('/instances/:id/activation-codes', asyncRoute(async (req, res) => {
    const input = validate(activationSchema, req.body || {});
    const activation = await service.issueActivation(validate(uuid, req.params.id), req.admin.id, input.ttlHours);
    let welcome;
    try { welcome=await deliveries.queueWelcome(req.params.id,activation); if(welcome.queued) await deliveries.processDue(1); }
    catch (_) { welcome={queued:false,reason:'WELCOME_QUEUE_FAILED'}; }
    res.status(201).json({ success: true, activation, welcome, warning: 'El código sólo se mostrará en esta respuesta.' });
  }));
  admin.post('/instances/:id/subscriptions', asyncRoute(async (req, res) => res.status(201).json({
    success: true,
    subscription: await service.assignSubscription(validate(uuid, req.params.id), validate(subscriptionSchema, req.body), req.admin.id),
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

  const webRoot = path.resolve(__dirname, '../../central-manager/dist');
  app.use(express.static(webRoot, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/health$).*/, (_req, res) => res.sendFile(path.join(webRoot, 'index.html')));

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
