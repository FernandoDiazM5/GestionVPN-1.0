'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { digest } = require('../src/domain/adminSecurity');

const activationPepper = 'pepper-de-prueba-de-activacion-joinpoint-32-bytes';
const sessionToken = 'sesion-administrativa-prueba-segura';
const csrfToken = 'csrf-administrativo-prueba-seguro';
const cookie = `__Host-joinpoint_admin=${sessionToken}`;
const fixedNow = () => new Date('2026-08-15T12:00:00Z');

function testPool() {
  return {
    query: async sql => {
      if (sql.includes('FROM control_plane_admin_sessions')) return [[{
        id: 'session-1', admin_id: 'admin-1', csrf_digest: digest(csrfToken),
        user_agent_hash: digest(''),
        expires_at: new Date('2026-08-16T00:00:00Z'), idle_expires_at: new Date('2026-08-16T00:00:00Z'),
        email: 'admin@joinpoint.cloud', display_name: 'Administrador',
      }]];
      if (sql.includes('FROM customers')) return [[{ id: 'customer-1', display_name: 'Cliente Uno', status: 'ACTIVE' }]];
      if (sql.includes("setting_key='root_domain'")) return [[{ setting_value: 'joinpoint.cloud' }]];
      if (sql.includes('FROM product_instances')) return [[]];
      return [{ affectedRows: 1 }];
    },
    getConnection: async () => { throw new Error('UNEXPECTED_TRANSACTION'); },
  };
}

test('health es publico pero la administracion exige sesion valida', async () => {
  const app = createApp({ pool: testPool(), activationPepper, now: fixedNow });
  await request(app).get('/health').expect(200, { success: true, status: 'ok' });
  await request(app).get('/api/admin/customers').expect(401, { success: false, code: 'ADMIN_AUTH_REQUIRED' });
  const response = await request(app).get('/api/admin/customers').set('Cookie', cookie).expect(200);
  assert.equal(response.body.customers.length, 1);
});

test('me rota y entrega un CSRF para pestañas nuevas con cookie válida', async () => {
  const app = createApp({ pool: testPool(), activationPepper, now: fixedNow });
  const response = await request(app).get('/api/admin/me').set('Cookie', cookie).expect(200);
  assert.equal(response.body.admin.email, 'admin@joinpoint.cloud');
  assert.match(response.body.csrfToken, /^[A-Za-z0-9_-]{40,}$/);
});

test('exige CSRF en escrituras y no filtra detalles internos', async () => {
  const app = createApp({ pool: testPool(), activationPepper, now: fixedNow });
  await request(app).post('/api/admin/customers').set('Cookie', cookie)
    .send({ legalName: 'Empresa Legal', displayName: 'Cliente' }).expect(403, { success: false, code: 'CSRF_REQUIRED' });
  const invalid = await request(app).post('/api/admin/customers').set('Cookie', cookie).set('x-csrf-token', csrfToken)
    .send({ legalName: 'A', displayName: 'Cliente', unexpected: true }).expect(400);
  assert.equal(invalid.body.code, 'VALIDATION_ERROR');
  const created = await request(app).post('/api/admin/customers').set('Cookie', cookie).set('x-csrf-token', csrfToken)
    .send({ legalName: 'Empresa Legal', displayName: 'Cliente' }).expect(201);
  assert.equal(created.body.customer.status, 'ACTIVE');
});

test('los listados de activacion nunca contienen el codigo secreto', async () => {
  const pool = testPool();
  const original = pool.query;
  pool.query = async sql => sql.includes('FROM activation_codes')
    ? [[{ id: 'activation-1', instance_id: '550e8400-e29b-41d4-a716-446655440000', status: 'ISSUED' }]] : original(sql);
  const app = createApp({ pool, activationPepper, now: fixedNow });
  const response = await request(app).get('/api/admin/instances/550e8400-e29b-41d4-a716-446655440000/activation-codes')
    .set('Cookie', cookie).expect(200);
  assert.equal(response.body.activations[0].code, undefined);
  assert.equal(response.body.activations[0].code_digest, undefined);
});
