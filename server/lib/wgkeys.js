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
 *
 * `allowedIps` es OBLIGATORIO: estos son túneles de GESTIÓN split-tunnel y el
 * router NO da salida a internet a los clientes de gestión. Un default a
 * 0.0.0.0/0 enrutaría TODO el tráfico al router → cliente SIN INTERNET (HANDOFF
 * §4.10; fue el corte del 2026-06-20). Si falta, fallamos ruidosamente en vez de
 * generar silenciosamente un .conf que mata la conexión del cliente.
 */
function buildClientConf({ privateKey, address, serverPublicKey, endpoint, allowedIps, dns }) {
  if (!allowedIps || !String(allowedIps).trim()) {
    throw new Error('buildClientConf: allowedIps es obligatorio (split-tunnel). NUNCA 0.0.0.0/0 en un túnel de gestión.');
  }
  return [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    `Address = ${address}/32`,
    `DNS = ${dns || '8.8.8.8'}`,
    '',
    '[Peer]',
    `PublicKey = ${serverPublicKey}`,
    `AllowedIPs = ${allowedIps}`,
    `Endpoint = ${endpoint}`,
    'PersistentKeepalive = 25',
    '',
  ].join('\n');
}

module.exports = { generateKeyPair, buildClientConf };
