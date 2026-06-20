// ============================================================
//  lib/sstpCreds.js — generación dinámica de credenciales PPP (SSTP)
//
//  Espejo del auto-gen de llaves WG: el operador NO escribe usuario ni
//  contraseña; el servidor los genera y los entrega embebidos en el script
//  del CPE (sstp-client) para copiar/pegar en el nodo remoto.
// ============================================================
const crypto = require('crypto');

// Charset sin caracteres ambiguos ni especiales: seguro dentro del `password=`
// de un script RouterOS (sin espacios, comillas ni metacaracteres de shell).
const PWD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Contraseña PPP segura (alfanumérica, ~20 chars). */
function generatePppPassword(len = 20) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += PWD_CHARS[bytes[i] % PWD_CHARS.length];
  return out;
}

/**
 * Usuario PPP determinístico y único por nodo: `ppp-<nombre>-nd<ND>`.
 * El ND lo hace único (evita choque con la constraint UNIQUE de ppp_user
 * cuando dos torres comparten nombre).
 */
function generatePppUser(nameUpper, nd) {
  const slug = String(nameUpper || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'nodo';
  return `ppp-${slug}-nd${nd}`;
}

module.exports = { generatePppPassword, generatePppUser };
