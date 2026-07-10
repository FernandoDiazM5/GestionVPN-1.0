// ============================================================
//  Repositorio WireGuard por miembro (Roles v2 — Fase E)
//
//  Multi-workspace: el peer WG es GLOBAL por persona (UNIQUE user_id) y se
//  reutiliza en todos sus workspaces. `workspace_id` es INFORMATIVO (dónde
//  se provisionó por última vez); las búsquedas van por user_id. Las firmas
//  conservan `workspaceId` por compatibilidad con los call-sites.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

async function upsert({ workspaceId, userId, peerName, allowedIp, publicKey, serverPublicKey, endpoint, configEnc }) {
  await query(
    `INSERT INTO member_wireguard
       (id, workspace_id, user_id, peer_name, allowed_ip, public_key, server_public_key, endpoint, config_enc, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       workspace_id = VALUES(workspace_id),
       peer_name = VALUES(peer_name), allowed_ip = VALUES(allowed_ip),
       public_key = VALUES(public_key), server_public_key = VALUES(server_public_key),
       endpoint = VALUES(endpoint), config_enc = VALUES(config_enc), created_at = VALUES(created_at)`,
    [crypto.randomUUID(), workspaceId, userId, peerName, allowedIp, publicKey || null,
     serverPublicKey || null, endpoint || null, configEnc || null, Date.now()]
  );
}

async function getByUser(_workspaceId, userId) {
  const rows = await query(
    'SELECT * FROM member_wireguard WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

/** Busca por public_key. El peer es global; la pertenencia al workspace la
 *  valida el caller contra workspace_members (no contra esta fila). */
async function getByPublicKey(_workspaceId, publicKey) {
  const rows = await query(
    'SELECT * FROM member_wireguard WHERE public_key = ? LIMIT 1',
    [publicKey]
  );
  return rows[0] || null;
}

/** Guarda/reemplaza el .conf cifrado (AES-256-GCM) sin tocar los demás campos. */
async function updateConfig({ workspaceId: _workspaceId, userId, configEnc }) {
  await query(
    'UPDATE member_wireguard SET config_enc = ? WHERE user_id = ?',
    [configEnc || null, userId]
  );
}

module.exports = { upsert, getByUser, getByPublicKey, updateConfig };
