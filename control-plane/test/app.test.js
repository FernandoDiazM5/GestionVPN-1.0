'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

const adminToken = 'token-administrativo-prueba-joinpoint-32-caracteres';
const activationPepper = 'pepper-de-prueba-de-activacion-joinpoint-32-bytes';

function testPool() {
  return {
    query: async sql => {
      if (sql.includes('FROM customers')) return [[{ id: 'customer-1', display_name: 'Cliente Uno', status: 'ACTIVE' }]];
      if (sql.includes("setting_key='root_domain'")) return [[{ setting_value: 'joinpoint.cloud' }]];
      if (sql.includes('FROM product_instances')) return [[]];
      return [{ affectedRows: 1 }];
    },
    getConnection: async () => { throw new Error('UNEXPECTED_TRANSACTION'); },
  };
}

test('health es público pero la administración exige bearer válido', async () => {
  const app = createApp({ pool: testPool(), adminToken, activationPepper });
  await request(app).get('/health').expect(200, { success: true, status: 'ok' });
  await request(app).get('/api/admin/customers').expect(401, { success: false, code: 'ADMIN_AUTH_REQUIRED' });
  await request(app).get('/api/admin/customers').set('Authorization', 'Bearer incorrecto').expect(401);
  const response = await request(app).get('/api/admin/customers').set('Authorization', `Bearer ${adminToken}`).expect(200);
  assert.equal(response.body.customers.length, 1);
});

test('rechaza cuerpos desconocidos y no filtra detalles internos', async () => {
  const app = createApp({ pool: testPool(), adminToken, activationPepper });
  const invalid = await request(app)
    .post('/api/admin/customers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ legalName: 'A', displayName: 'Cliente', unexpected: true })
    .expect(400);
  assert.equal(invalid.body.code, 'VALIDATION_ERROR');

  const failure = await request(app)
    .post('/api/admin/customers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ legalName: 'Empresa Legal', displayName: 'Cliente' })
    .expect(201);
  assert.equal(failure.body.customer.status, 'ACTIVE');
});

test('los listados de activación nunca contienen el código secreto', async () => {
  const pool = testPool();
  pool.query = async sql => sql.includes('FROM activation_codes')
    ? [[{ id: 'activation-1', instance_id: '550e8400-e29b-41d4-a716-446655440000', status: 'ISSUED' }]]
    : [[]];
  const app = createApp({ pool, adminToken, activationPepper });
  const response = await request(app)
    .get('/api/admin/instances/550e8400-e29b-41d4-a716-446655440000/activation-codes')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(response.body.activations[0].code, undefined);
  assert.equal(response.body.activations[0].code_digest, undefined);
});
