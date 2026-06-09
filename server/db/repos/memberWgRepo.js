// ============================================================
//  Repositorio WireGuard por miembro (Roles v2 — Fase E)
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

async function upsert({ workspaceId, userId, peerName, allowedIp, publicKey, serverPublicKey, endpoint, configEnc }) {
  await query(
    `INSERT INTO member_wireguard
       (id, workspace_id, user_id, peer_name, allowed_ip, public_key, server_public_key, endpoint, config_enc, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       peer_name = VALUES(peer_name), allowed_ip = VALUES(allowed_ip),
       public_key = VALUES(public_key), server_public_key = VALUES(server_public_key),
       endpoint = VALUES(endpoint), config_enc = VALUES(config_enc), created_at = VALUES(created_at)`,
    [crypto.randomUUID(), workspaceId, userId, peerName, allowedIp, publicKey || null,
     serverPublicKey || null, endpoint || null, configEnc || null, Date.now()]
  );
}

async function getByUser(workspaceId, userId) {
  const rows = await query(
    'SELECT * FROM member_wireguard WHERE workspace_id = ? AND user_id = ? LIMIT 1',
    [workspaceId, userId]
  );
  return rows[0] || null;
}

/** Busca por public_key restringido al workspace (anti cross-tenant). */
async function getByPublicKey(workspaceId, publicKey) {
  const rows = await query(
    'SELECT * FROM member_wireguard WHERE workspace_id = ? AND public_key = ? LIMIT 1',
    [workspaceId, publicKey]
  );
  return rows[0] || null;
}

/** Guarda/reemplaza el .conf cifrado (AES-256-GCM) sin tocar los demás campos. */
async function updateConfig({ workspaceId, userId, configEnc }) {
  await query(
    'UPDATE member_wireguard SET config_enc = ? WHERE workspace_id = ? AND user_id = ?',
    [configEnc || null, workspaceId, userId]
  );
}

module.exports = { upsert, getByUser, getByPublicKey, updateConfig };
