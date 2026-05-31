// ============================================================
//  Repositorio WireGuard por miembro (Roles v2 — Fase E)
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

async function upsert({ workspaceId, userId, peerName, allowedIp, publicKey, configEnc }) {
  await query(
    `INSERT INTO member_wireguard (id, workspace_id, user_id, peer_name, allowed_ip, public_key, config_enc, created_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       peer_name = VALUES(peer_name), allowed_ip = VALUES(allowed_ip),
       public_key = VALUES(public_key), config_enc = VALUES(config_enc), created_at = VALUES(created_at)`,
    [crypto.randomUUID(), workspaceId, userId, peerName, allowedIp, publicKey || null, configEnc || null, Date.now()]
  );
}

async function getByUser(workspaceId, userId) {
  const rows = await query(
    'SELECT * FROM member_wireguard WHERE workspace_id = ? AND user_id = ? LIMIT 1',
    [workspaceId, userId]
  );
  return rows[0] || null;
}

module.exports = { upsert, getByUser };
