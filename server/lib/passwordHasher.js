const argon2 = require('argon2');
const bcrypt = require('bcryptjs');

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: Number(process.env.ARGON2_MEMORY_KIB) || 19 * 1024,
  timeCost: Number(process.env.ARGON2_TIME_COST) || 2,
  parallelism: Number(process.env.ARGON2_PARALLELISM) || 1,
  hashLength: 32,
});

function isArgon2Hash(encodedHash) {
  return typeof encodedHash === 'string' && encodedHash.startsWith('$argon2id$');
}

function isBcryptHash(encodedHash) {
  return typeof encodedHash === 'string' && /^\$2[aby]\$/.test(encodedHash);
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

async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;
  try {
    if (isArgon2Hash(encodedHash)) return await argon2.verify(encodedHash, password);
    // bcrypt sólo considera los primeros 72 bytes. Rechazar entradas más largas
    // evita aceptar dos passwords distintos que compartan ese prefijo heredado.
    if (isBcryptHash(encodedHash)) {
      if (Buffer.byteLength(password, 'utf8') > 72) return false;
      return await bcrypt.compare(password, encodedHash);
    }
    return false;
  } catch (_) {
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
  const valid = await verifyPassword(password, encodedHash);
  if (!valid) return { valid: false, upgraded: false };
  if (!needsRehash(encodedHash)) return { valid: true, upgraded: false };
  if (typeof updateIfCurrent !== 'function') throw new TypeError('updateIfCurrent es obligatorio para rehash');

  const upgradedHash = await hashPassword(password);
  const updated = await updateIfCurrent(upgradedHash, encodedHash);
  return { valid: true, upgraded: Boolean(updated) };
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
