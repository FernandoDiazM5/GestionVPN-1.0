const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function assertKid(value, label) {
  if (!KID_RE.test(value)) throw new Error(`${label} inválido`);
  return value;
}

function assertSecret(value, label) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`${label} debe tener al menos 32 bytes`);
  }
  return value;
}

function legacySecret() {
  if (process.env.NODE_ENV === 'test' && process.env.JWT_SECRET_TEST) {
    return assertSecret(process.env.JWT_SECRET_TEST, 'JWT_SECRET_TEST');
  }
  const secretFile = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), '.jwt_secret');
  if (fs.existsSync(secretFile)) {
    return assertSecret(fs.readFileSync(secretFile, 'utf8').trim(), '.jwt_secret');
  }
  const generated = crypto.randomBytes(64).toString('hex');
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  fs.writeFileSync(secretFile, generated, { mode: 0o600, flag: 'wx' });
  return generated;
}

const active = Object.freeze({
  kid: assertKid(process.env.JWT_ACTIVE_KID || 'legacy', 'JWT_ACTIVE_KID'),
  secret: assertSecret(process.env.JWT_ACTIVE_SECRET || legacySecret(), 'JWT_ACTIVE_SECRET'),
});

let previous = null;
if (process.env.JWT_PREVIOUS_SECRET || process.env.JWT_PREVIOUS_KID) {
  if (!process.env.JWT_PREVIOUS_SECRET || !process.env.JWT_PREVIOUS_KID) {
    throw new Error('JWT_PREVIOUS_SECRET y JWT_PREVIOUS_KID deben configurarse juntos');
  }
  previous = Object.freeze({
    kid: assertKid(process.env.JWT_PREVIOUS_KID, 'JWT_PREVIOUS_KID'),
    secret: assertSecret(process.env.JWT_PREVIOUS_SECRET, 'JWT_PREVIOUS_SECRET'),
  });
  if (previous.kid === active.kid) throw new Error('JWT_ACTIVE_KID y JWT_PREVIOUS_KID deben ser distintos');
}

function verificationKeys(kid) {
  if (!kid) return previous ? [active, previous] : [active];
  if (kid === active.kid) return [active];
  if (previous && kid === previous.kid) return [previous];
  return [];
}

module.exports = { active, previous, verificationKeys };
