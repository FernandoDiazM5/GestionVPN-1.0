// ============================================================
//  Repositorio de usuarios (MySQL) — Fase 2
//  Respeta soft-deletes (deleted_at IS NULL = activo).
// ============================================================
const { query } = require('../mysql');

async function findByEmail(email) {
  const rows = await query(
    'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const rows = await query(
    'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

/**
 * Busca un usuario por su `name` (usado como username de login).
 * Coincidencia exacta sin distinguir mayúsculas. Si hay varios con el
 * mismo nombre, devuelve el más antiguo (determinista).
 */
async function findByName(name) {
  if (!name) return null;
  const rows = await query(
    'SELECT * FROM users WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
    [String(name).trim()]
  );
  return rows[0] || null;
}

/** Inserta un usuario sin verificar (pendiente de OTP). */
async function createPending({ id, email, passwordHash, name, otpHash, otpExpiresAt }) {
  const now = Date.now();
  await query(
    `INSERT INTO users
       (id, email, password_hash, name, email_verified, otp_hash, otp_expires_at, otp_attempts, created_at, updated_at)
     VALUES (?,?,?,?,0,?,?,0,?,?)`,
    [id, email, passwordHash, name || '', otpHash, otpExpiresAt, now, now]
  );
}

async function setOtp(id, otpHash, otpExpiresAt) {
  await query(
    'UPDATE users SET otp_hash = ?, otp_expires_at = ?, otp_attempts = 0, updated_at = ? WHERE id = ?',
    [otpHash, otpExpiresAt, Date.now(), id]
  );
}

async function incOtpAttempts(id) {
  await query('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = ?', [id]);
}

async function markVerified(id) {
  await query(
    'UPDATE users SET email_verified = 1, otp_hash = NULL, otp_expires_at = NULL, updated_at = ? WHERE id = ?',
    [Date.now(), id]
  );
}

module.exports = { findByEmail, findById, findByName, createPending, setOtp, incOtpAttempts, markVerified };
