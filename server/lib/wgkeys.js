// ============================================================
//  Generación de llaves WireGuard (Roles v2 — Fase E)
//  Usa Curve25519 (X25519) nativo de Node. Extrae los 32 bytes
//  crudos de la codificación DER → base64 (formato WireGuard).
// ============================================================
const { generateKeyPairSync } = require('crypto');

/** Genera un par de llaves WireGuard { publicKey, privateKey } en base64. */
function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  // En DER, los últimos 32 bytes son la clave cruda Curve25519.
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  return {
    publicKey: pubRaw.toString('base64'),
    privateKey: privRaw.toString('base64'),
  };
}

/**
 * Construye el contenido de un archivo .conf de cliente WireGuard.
 */
function buildClientConf({ privateKey, address, serverPublicKey, endpoint, allowedIps, dns }) {
  return [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    `Address = ${address}/32`,
    `DNS = ${dns || '8.8.8.8'}`,
    '',
    '[Peer]',
    `PublicKey = ${serverPublicKey}`,
    `AllowedIPs = ${allowedIps || '0.0.0.0/0'}`,
    `Endpoint = ${endpoint}`,
    'PersistentKeepalive = 25',
    '',
  ].join('\n');
}

module.exports = { generateKeyPair, buildClientConf };
