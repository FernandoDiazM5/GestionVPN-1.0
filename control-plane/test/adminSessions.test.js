'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminSessionService } = require('../src/services/adminSessions');
const { hashPassword, encryptSecret } = require('../src/domain/adminSecurity');

const key = Buffer.alloc(32, 9).toString('base64');
const now = new Date('2026-08-15T12:00:00Z');
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function currentCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const keyBytes = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now.getTime() / 30000)));
  const hmac = crypto.createHmac('sha1', keyBytes).update(counter).digest();
  const offset = hmac[19] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function fixture(failedLoginCount = 0, recoveryId = null) {
  const calls = [];
  const admin = { id:'admin-1', email:'admin@joinpoint.cloud', display_name:'Administrador', status:'ACTIVE',
    failed_login_count:failedLoginCount, locked_until:null, password_hash:await hashPassword('contraseña-central-segura'),
    totp_secret_encrypted:encryptSecret(secret, key) };
  const connection = {
    beginTransaction:async()=>calls.push(['begin']),
    query:async(sql,params)=>{
      calls.push([sql,params]);
      if (sql.includes('FROM control_plane_admins')) return [[admin]];
      if (sql.includes('FROM control_plane_admin_recovery_codes')) return [recoveryId ? [{ id:recoveryId }] : []];
      if (sql.startsWith('SELECT window_started_at')) return [[]];
      return [{affectedRows:1}];
    },
    commit:async()=>calls.push(['commit']), rollback:async()=>calls.push(['rollback']), release:()=>calls.push(['release']),
  };
  return { pool:{getConnection:async()=>connection}, calls };
}

test('crea una sesión opaca sólo con contraseña y TOTP válidos', async () => {
  const { pool, calls } = await fixture();
  const service = createAdminSessionService({ pool, mfaEncryptionKey:key, sessionPepper:'pepper-de-sesion-administrativa-seguro', now:()=>now });
  const result = await service.login({ email:'ADMIN@JOINPOINT.CLOUD', password:'contraseña-central-segura', totp:currentCode(), sourceIp:'203.0.113.5', userAgent:'browser' });
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(result.csrf, /^[A-Za-z0-9_-]{43}$/);
  const insert = calls.find(call => String(call[0]).includes('INSERT INTO control_plane_admin_sessions'));
  assert.equal(insert[1].includes(result.token), false);
  assert.equal(calls.some(call => call[0] === 'commit'), true);
});

test('el quinto fallo bloquea temporalmente la cuenta sin revelar el factor incorrecto', async () => {
  const { pool, calls } = await fixture(4);
  const service = createAdminSessionService({ pool, mfaEncryptionKey:key, sessionPepper:'pepper-de-sesion-administrativa-seguro', now:()=>now });
  await assert.rejects(service.login({ email:'admin@joinpoint.cloud', password:'contraseña-central-segura', totp:'000000', sourceIp:'203.0.113.5', userAgent:'browser' }), /ADMIN_LOGIN_FAILED/);
  const lock = calls.find(call => String(call[0]).includes('SET failed_login_count'));
  assert.equal(lock[1][0], 0);
  assert.equal(lock[1][1] > now, true);
});

test('consume un código de recuperación al crear la sesión', async () => {
  const { pool, calls } = await fixture(0, 'recovery-1');
  const service = createAdminSessionService({ pool, mfaEncryptionKey:key, sessionPepper:'pepper-de-sesion-administrativa-seguro', now:()=>now });
  const result = await service.login({ email:'admin@joinpoint.cloud', password:'contraseña-central-segura',
    recoveryCode:'JPR-ABCDE-ABCDE-ABCDE-ABCDE', sourceIp:'203.0.113.5', userAgent:'browser' });
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(calls.some(call => String(call[0]).includes('SET consumed_at=')), true);
});

test('bloquea durablemente el origen al superar diez intentos', async () => {
  const { pool, calls } = await fixture();
  const original = (await pool.getConnection()).query;
  const connection = await pool.getConnection();
  connection.query = async (sql, params) => {
    calls.push([sql, params]);
    if (sql.startsWith('SELECT window_started_at')) return [[{ window_started_at:now, attempts:10, blocked_until:null }]];
    return original(sql, params);
  };
  const service = createAdminSessionService({ pool, mfaEncryptionKey:key, sessionPepper:'pepper-de-sesion-administrativa-seguro', now:()=>now });
  await assert.rejects(service.login({ email:'admin@joinpoint.cloud', password:'contraseña-central-segura',
    totp:currentCode(), sourceIp:'203.0.113.5', userAgent:'browser' }), error => {
    assert.equal(error.code, 'ADMIN_LOGIN_RATE_LIMITED'); assert.equal(error.retryAfterSeconds, 1800); return true;
  });
  assert.equal(calls.some(call => String(call[0]).includes('blocked_until=')), true);
});

test('regenera códigos tras reautenticar e invalida el conjunto anterior', async () => {
  const { pool, calls } = await fixture();
  const service = createAdminSessionService({ pool, mfaEncryptionKey:key, sessionPepper:'pepper-de-sesion-administrativa-seguro', now:()=>now });
  const codes = await service.regenerateRecoveryCodes('admin-1', { password:'contraseña-central-segura', totp:currentCode() });
  assert.equal(codes.length, 10);
  assert.equal(calls.some(call => String(call[0]).startsWith('DELETE FROM control_plane_admin_recovery_codes')), true);
  const inserts = calls.filter(call => String(call[0]).startsWith('INSERT INTO control_plane_admin_recovery_codes'));
  assert.equal(inserts.length, 10);
  assert.equal(inserts.some(call => call[1].some(value => codes.includes(value))), false);
});
