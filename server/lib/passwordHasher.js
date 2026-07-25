const argon2 = require('argon2');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const metrics = require('./metrics');

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: Number(process.env.ARGON2_MEMORY_KIB) || 19 * 1024,
  timeCost: Number(process.env.ARGON2_TIME_COST) || 2,
  parallelism: Number(process.env.ARGON2_PARALLELISM) || 1,
  hashLength: 32,
});

// Un único hash válido por proceso. No representa una cuenta real ni se guarda.
// Las búsquedas inexistentes pagan el mismo coste criptográfico que Argon2id.
const dummyHashPromise = argon2.hash(crypto.randomBytes(32).toString('hex'), ARGON2_OPTIONS);

function isArgon2Hash(encodedHash) {
  return typeof encodedHash === 'string' && encodedHash.startsWith('$argon2id$');
}

function isBcryptHash(encodedHash) {
  return typeof encodedHash === 'string' && /^\$2[aby]\$/.test(encodedHash);
}

function hashAlgorithm(encodedHash) {
  if (isArgon2Hash(encodedHash)) return 'argon2id';
  if (isBcryptHash(encodedHash)) return 'bcrypt';
  return 'dummy';
}

function assertNewPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new TypeError('La contraseña debe tener entre 12 y 128 caracteres');
  }
}

async function hashPassword(password) {
  assertNewPassword(password);
  return argon2.hash(password, ARGON2_OPTIONS);
}

// Rehashear una contraseña heredada ya verificada no equivale a crear una
// contraseña nueva. La política de longitud se aplica al alta/cambio, pero no
// debe bloquear el login ni impedir la migración transparente bcrypt→Argon2id.
async function hashVerifiedPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;
  const algorithm = hashAlgorithm(encodedHash);
  try {
    let valid = false;
    if (isArgon2Hash(encodedHash)) valid = await argon2.verify(encodedHash, password);
    // bcrypt sólo considera los primeros 72 bytes. Rechazar entradas más largas
    // evita aceptar dos passwords distintos que compartan ese prefijo heredado.
    else if (isBcryptHash(encodedHash)) {
      if (Buffer.byteLength(password, 'utf8') <= 72) {
        valid = await bcrypt.compare(password, encodedHash);
      } else {
        // bcrypt rechaza conceptualmente estos inputs. Aun así pagamos una
        // verificación costosa para no crear un atajo temporal observable.
        await argon2.verify(await dummyHashPromise, password);
      }
    }
    metrics.passwordHashVerificationsTotal.inc({ algorithm, result: valid ? 'valid' : 'invalid' });
    return valid;
  } catch (_) {
    metrics.passwordHashVerificationsTotal.inc({ algorithm, result: 'invalid' });
    return false;
  }
}

function needsRehash(encodedHash) {
  if (isBcryptHash(encodedHash)) return true;
  if (!isArgon2Hash(encodedHash)) return false;
  try { return argon2.needsRehash(encodedHash, ARGON2_OPTIONS); }
  catch (_) { return false; }
}

/**
 * Verifica y, si corresponde, entrega un Argon2id nuevo a un callback que debe
 * actualizar condicionalmente por el hash anterior para evitar lost updates.
 */
async function verifyAndUpgrade(password, encodedHash, updateIfCurrent) {
  if (!isArgon2Hash(encodedHash) && !isBcryptHash(encodedHash)) {
    try {
      await argon2.verify(await dummyHashPromise, String(password ?? ''));
    } catch (_) {
      // El camino ficticio nunca convierte un fallo de verificación en una
      // respuesta distinta; los fallos reales de infraestructura se observan
      // mediante health/errores agregados, no por el contrato de login.
    } finally {
      metrics.passwordHashVerificationsTotal.inc({ algorithm: 'dummy', result: 'invalid' });
    }
    return { valid: false, upgraded: false, dummy: true };
  }
  const valid = await verifyPassword(password, encodedHash);
  if (!valid) return { valid: false, upgraded: false, dummy: false };
  if (!needsRehash(encodedHash)) return { valid: true, upgraded: false, dummy: false };
  if (typeof updateIfCurrent !== 'function') throw new TypeError('updateIfCurrent es obligatorio para rehash');

  const upgradedHash = await hashVerifiedPassword(password);
  const updated = await updateIfCurrent(upgradedHash, encodedHash);
  return { valid: true, upgraded: Boolean(updated), dummy: false };
}

module.exports = {
  ARGON2_OPTIONS,
  hashPassword,
  verifyPassword,
  needsRehash,
  verifyAndUpgrade,
  isArgon2Hash,
  isBcryptHash,
};
