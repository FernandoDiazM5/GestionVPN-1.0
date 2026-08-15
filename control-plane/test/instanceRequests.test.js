'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalRequest, signInstanceRequest, verifyInstanceRequest, signTrustBundle, verifyTrustBundle } = require('../src/domain/instanceRequests');

const keys = crypto.generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type:'pkcs8', format:'pem' });
const publicKey = keys.publicKey.export({ type:'spki', format:'pem' });
const input = { method:'POST', path:'/api/instance/sync', instanceId:'550e8400-e29b-41d4-a716-446655440000',
  timestamp:1786795200, nonce:'abcdefghijklmnopqrstuv', body:{ requestLicense:false, softwareVersion:'1.0.0' } };

test('firma una petición canónica vinculada a método, ruta, instancia, tiempo, nonce y cuerpo', () => {
  const signature = signInstanceRequest(input, privateKey);
  assert.equal(verifyInstanceRequest(input, signature, publicKey), true);
  assert.equal(verifyInstanceRequest({ ...input, body:{ ...input.body, softwareVersion:'2.0.0' } }, signature, publicKey), false);
  assert.match(canonicalRequest(input), /^JP-INSTANCE-V1\nPOST\n\/api\/instance\/sync\n/);
});

test('firma el paquete de confianza y detecta cambios en revocaciones', () => {
  const bundle = signTrustBundle({ generatedAt:1786795200, keys:[{ keyId:'central-1', status:'ACTIVE' }], revokedLicenses:[] },
    { keyId:'central-1', privateKey });
  assert.equal(verifyTrustBundle(bundle, publicKey), true);
  assert.equal(verifyTrustBundle({ ...bundle, payload:{ ...bundle.payload, revokedLicenses:[{ id:'alterada' }] } }, publicKey), false);
});
