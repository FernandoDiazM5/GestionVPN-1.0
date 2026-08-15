'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRootDomain,
  normalizeSubdomainLabel,
  deriveFqdn,
  proposeSubdomainLabel,
} = require('../src/domain/subdomains');

test('normaliza el dominio raíz sin acoplarlo al cliente', () => {
  assert.equal(normalizeRootDomain(' Joinpoint.Cloud. '), 'joinpoint.cloud');
  assert.equal(deriveFqdn('joinpoint.cloud', 'ISP-Norte'), 'isp-norte.joinpoint.cloud');
});

test('propone labels DNS estables desde el nombre comercial', () => {
  assert.equal(proposeSubdomainLabel('  Conexión Perú S.A.C. '), 'conexion-peru-s-a-c');
});

test('rechaza dominios, labels reservados y labels inseguros', () => {
  assert.throws(() => normalizeRootDomain('localhost'), /ROOT_DOMAIN_INVALID/);
  assert.throws(() => normalizeSubdomainLabel('admin'), /SUBDOMAIN_LABEL_RESERVED/);
  assert.throws(() => normalizeSubdomainLabel('--'), /SUBDOMAIN_LABEL_INVALID/);
});

test('cambiar el dominio raíz conserva el label del cliente', () => {
  const label = normalizeSubdomainLabel('cliente-demo');
  assert.equal(deriveFqdn('joinpoint.cloud', label), 'cliente-demo.joinpoint.cloud');
  assert.equal(deriveFqdn('nuevo-dominio.pe', label), 'cliente-demo.nuevo-dominio.pe');
});
