'use strict';

const express = require('express');
const { z } = require('zod');
const { createAdminAuth } = require('./middleware/adminAuth');
const { createAdminService } = require('./services/adminService');
const { activateInstance } = require('./services/activateInstance');

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

function createApp({ pool, adminToken, activationPepper, rateLimitPepper, signingKeyId, signingPrivateKey, now }) {
  const app = express();
  const service = createAdminService({ pool, activationPepper, now });
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
  if (rateLimitPepper && signingKeyId && signingPrivateKey) app.post('/api/activate', asyncRoute(async (req, res) => {
    const input = validate(publicActivationSchema, req.body);
    const activation = await activateInstance({ pool, ...input, activationPepper, rateLimitPepper,
      sourceIp: req.ip, signingKeyId, signingPrivateKey, now: now?.() || new Date() });
    res.status(201).json({ success: true, activation });
  }));

  const admin = express.Router();
  admin.use(createAdminAuth(adminToken));
  admin.get('/customers', asyncRoute(async (_req, res) => res.json({ success: true, customers: await service.listCustomers() })));
  admin.post('/customers', asyncRoute(async (req, res) => res.status(201).json({ success: true, customer: await service.createCustomer(validate(customerSchema, req.body)) })));
  admin.get('/plans', asyncRoute(async (_req, res) => res.json({ success: true, plans: await service.listPlans() })));
  admin.post('/plans', asyncRoute(async (req, res) => res.status(201).json({ success: true, plan: await service.createPlan(validate(planSchema, req.body)) })));
  admin.get('/instances', asyncRoute(async (_req, res) => res.json({ success: true, instances: await service.listInstances() })));
  admin.post('/instances', asyncRoute(async (req, res) => res.status(201).json({ success: true, instance: await service.createInstance(validate(instanceSchema, req.body)) })));
  admin.get('/instances/:id/activation-codes', asyncRoute(async (req, res) => res.json({ success: true, activations: await service.listActivations(validate(uuid, req.params.id)) })));
  admin.post('/instances/:id/activation-codes', asyncRoute(async (req, res) => {
    const input = validate(activationSchema, req.body || {});
    const activation = await service.issueActivation(validate(uuid, req.params.id), '00000000-0000-4000-8000-000000000000', input.ttlHours);
    res.status(201).json({ success: true, activation, warning: 'El código sólo se mostrará en esta respuesta.' });
  }));
  admin.post('/instances/:id/subscriptions', asyncRoute(async (req, res) => res.status(201).json({
    success: true,
    subscription: await service.assignSubscription(validate(uuid, req.params.id), validate(subscriptionSchema, req.body)),
  })));
  admin.post('/activation-codes/:id/revoke', asyncRoute(async (req, res) => res.json({ success: true, activation: await service.revokeActivation(validate(uuid, req.params.id)) })));
  app.use('/api/admin', admin);

  app.use((error, _req, res, _next) => {
    const duplicate = error?.code === 'ER_DUP_ENTRY';
    const publicActivationFailure = /^(ACTIVATION_CODE_|INSTANCE_ALREADY_ACTIVATED|SUBSCRIPTION_NOT_ACTIVE)/.test(error?.code || '');
    const status = error?.code === 'ACTIVATION_RATE_LIMITED' ? 429 : publicActivationFailure ? 400 : error?.code === 'VALIDATION_ERROR' ? 400
      : duplicate || /(_NOT_FOUND|_ALREADY_|_NOT_REVOCABLE|_INCOMPLETE|_EXHAUSTED)$/.test(error?.code || '') ? 409
        : 500;
    const code = duplicate ? 'RESOURCE_CONFLICT' : publicActivationFailure ? 'ACTIVATION_FAILED' : status === 500 ? 'INTERNAL_ERROR' : error.code;
    if (error?.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
    res.status(status).json({ success: false, code, ...(error.issues ? { issues: error.issues } : {}) });
  });
  return app;
}

module.exports = { createApp };
