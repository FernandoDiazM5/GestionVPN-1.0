// ============================================================
//  Repositorio de IPs de gestión por usuario (Multi-usuario)
//  Fuente de verdad para el src-address de la mangle.
//  ⚠️ La IP NUNCA se toma del request del cliente — siempre de aquí.
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

/**
 * Devuelve la IP de gestión del usuario (10.13.250.x mod/members · 10.14.250.x
 * admin), o null si no tiene. Multi-workspace: la IP es GLOBAL por persona
 * (UNIQUE user_id) — `workspaceId` se conserva en la firma por compatibilidad.
 * @returns {Promise<string|null>} mgmt_ip sin máscara, ej. "10.13.250.20"
 */
async function getMgmtIpForUser(_workspaceId, userId) {
  const rows = await query(
    'SELECT mgmt_ip FROM user_mgmt_ips WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] ? rows[0].mgmt_ip : null;
}

/** Registro completo (para diagnósticos). */
async function getByUser(_workspaceId, userId) {
  const rows = await query(
    'SELECT * FROM user_mgmt_ips WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

/**
 * Crea/actualiza el mapeo usuario→IP. Idempotente por user (UNIQUE user_id;
 * `workspace_id` queda informativo — dónde se provisionó por última vez).
 * Lanza si la IP ya pertenece a OTRO usuario (uq_umi_ip) → contención de colisión.
 */
async function upsert({ workspaceId, userId, mgmtIp, publicKey, source }) {
  const ip = String(mgmtIp || '').split('/')[0].trim();
  if (!ip) throw new Error('mgmtIp requerido');
  await query(
    `INSERT INTO user_mgmt_ips
       (id, workspace_id, user_id, mgmt_ip, public_key, source, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       workspace_id = VALUES(workspace_id),
       mgmt_ip = VALUES(mgmt_ip),
       public_key = VALUES(public_key),
       source = VALUES(source),
       updated_at = VALUES(updated_at)`,
    [crypto.randomUUID(), workspaceId, userId, ip, publicKey || null, source || 'manual', Date.now(), Date.now()]
  );
  return ip;
}

/** Lista el mapeo completo del workspace (admin). */
async function listForWorkspace(workspaceId) {
  return query(
    `SELECT umi.user_id, umi.mgmt_ip, umi.source, u.email, u.name
       FROM user_mgmt_ips umi JOIN users u ON u.id = umi.user_id
      WHERE umi.workspace_id = ? ORDER BY umi.mgmt_ip`,
    [workspaceId]
  );
}

module.exports = { getMgmtIpForUser, getByUser, upsert, listForWorkspace };
