// ============================================================
//  Capa de cifrado AES-256-GCM (Fase 1 — multi-usuario)
//  Reutiliza la MISMA clave (.db_secret) que db.service.js,
//  garantizando que las credenciales MikroTik cifradas sean
//  interoperables entre la capa SQLite (legacy) y la MySQL (RBAC).
//
//  NUNCA almacenar credenciales de router en texto plano.
// ============================================================
const { encryptPass, decryptPass } = require('../db.service');

/**
 * Cifra un texto plano (credencial de router, secreto VPN, etc.).
 * @param {string} plaintext
 * @returns {string} formato "iv:authTag:ciphertext" (hex)
 */
function encrypt(plaintext) {
  return encryptPass(plaintext);
}

/**
 * Descifra un valor previamente cifrado. Devuelve '' si falla.
 * @param {string} stored
 * @returns {string}
 */
function decrypt(stored) {
  return decryptPass(stored);
}

module.exports = { encrypt, decrypt };
