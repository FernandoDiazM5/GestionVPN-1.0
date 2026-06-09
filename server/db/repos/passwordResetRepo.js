// ============================================================
//  Repositorio de tokens de recuperación de contraseña (Fase D)
//
//  Diseño de seguridad:
//   • Token = 32 bytes hex generados con crypto.randomBytes (~256 bits)
//   • SOLO el HASH (bcrypt) se almacena — el token en claro nunca toca BD
//   • Expira a los 15 min; single-use (used_at se marca al consumir)
//   • CASCADE al borrar user (definido en la FK del schema)
// ============================================================
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../mysql');

const TTL_MS = 15 * 60 * 1000;
const TOKEN_BYTES = 32;

/** Genera un token criptográfico aleatorio (devuelve token + hash). */
async function generateToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const hash = await bcrypt.hash(token, 10);
  return { token, hash };
}

/** Inserta un token nuevo y devuelve el id de la fila. */
async function create({ userId, tokenHash, ipAddress }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await query(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip_address, created_at)
     VALUES (?,?,?,?,?,?)`,
    [id, userId, tokenHash, now + TTL_MS, ipAddress || null, now]
  );
  return { id, expiresAt: now + TTL_MS };
}

/**
 * Busca un token VIGENTE (no usado ni expirado) que matchee `token` para
 * algún user. Por ser hash, hay que iterar — pero solo sobre los vigentes,
 * que típicamente son pocos. Devuelve la fila + user_id o null.
 */
async function findValid(token) {
  const now = Date.now();
  const rows = await query(
    'SELECT id, user_id, token_hash FROM password_resets WHERE used_at IS NULL AND expires_at > ?',
    [now]
  );
  for (const row of rows) {
    // bcrypt.compare es la única forma de validar un hash
    // eslint-disable-next-line no-await-in-loop
    const ok = await bcrypt.compare(token, row.token_hash);
    if (ok) return { id: row.id, userId: row.user_id };
  }
  return null;
}

/** Marca el token como usado (single-use). */
async function markUsed(id) {
  await query('UPDATE password_resets SET used_at = ? WHERE id = ?', [Date.now(), id]);
}

/** Invalida cualquier token previo (vigente) de un user. */
async function invalidateForUser(userId) {
  await query(
    'UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
    [Date.now(), userId]
  );
}

/** Cuenta tokens recientes (anti-spam). */
async function countRecent(userId, windowMs) {
  const since = Date.now() - windowMs;
  const rows = await query(
    'SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?',
    [userId, since]
  );
  return Number(rows[0]?.n || 0);
}

module.exports = {
  TTL_MS,
  generateToken,
  create,
  findValid,
  markUsed,
  invalidateForUser,
  countRecent,
};
