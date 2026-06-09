// ============================================================
//  Repositorio de sesiones de túnel por usuario (Multi-usuario)
//  Regla: 1 sesión ACTIVE por usuario (forzada en transacción).
//  El repo gestiona SOLO el estado en BD; la mangle en MikroTik
//  la orquesta la ruta (necesita la conexión RouterOS).
// ============================================================
const crypto = require('crypto');
const { query, withTransaction } = require('../mysql');

const TTL_MS = 30 * 60 * 1000; // 30 min — igual al timeout legacy

/** Sesión ACTIVE del usuario (o null). */
async function getActiveByUser(workspaceId, userId) {
  const rows = await query(
    `SELECT * FROM tunnel_user_sessions
      WHERE workspace_id = ? AND user_id = ? AND status = 'ACTIVE'
      ORDER BY activated_at DESC LIMIT 1`,
    [workspaceId, userId]
  );
  return rows[0] || null;
}

/** Sesión ACTIVE de un túnel concreto (para "en uso por otro" — admin). */
async function getActiveByTunnel(workspaceId, tunnelId) {
  const rows = await query(
    `SELECT s.*, u.name AS user_name, u.email AS user_email
       FROM tunnel_user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.workspace_id = ? AND s.tunnel_id = ? AND s.status = 'ACTIVE'
      ORDER BY s.activated_at DESC LIMIT 1`,
    [workspaceId, tunnelId]
  );
  return rows[0] || null;
}

/** Todas las sesiones ACTIVE del workspace (admin / dashboard). */
async function listActiveForWorkspace(workspaceId) {
  return query(
    `SELECT s.*, u.name AS user_name, u.email AS user_email
       FROM tunnel_user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.workspace_id = ? AND s.status = 'ACTIVE'
      ORDER BY s.activated_at DESC`,
    [workspaceId]
  );
}

/** Mapa tunnel_id → sesión ACTIVE del workspace (para anotar /nodes en 1 query). */
async function activeMapForWorkspace(workspaceId) {
  const rows = await listActiveForWorkspace(workspaceId);
  const map = new Map();
  for (const r of rows) map.set(r.tunnel_id, r);
  return map;
}

/**
 * Crea una sesión ACTIVE para el usuario, cerrando cualquier ACTIVE previa
 * (garantía "1 por usuario") en una sola transacción.
 * @returns {Promise<{ id, expires_at }>}
 */
async function createSession({ workspaceId, userId, tunnelId, vrfName, mgmtIp, mangleId, firewallRuleIds }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + TTL_MS;
  await withTransaction(async (tx) => {
    // Cierra cualquier ACTIVE previa del usuario (defensa anti-duplicado)
    await tx.query(
      `UPDATE tunnel_user_sessions
          SET status = 'CLOSED', deactivated_at = ?
        WHERE workspace_id = ? AND user_id = ? AND status = 'ACTIVE'`,
      [now, workspaceId, userId]
    );
    await tx.query(
      `INSERT INTO tunnel_user_sessions
         (id, workspace_id, user_id, tunnel_id, vrf_name, mgmt_ip, status,
          mangle_id, firewall_rule_ids, activated_at, expires_at)
       VALUES (?,?,?,?,?,?, 'ACTIVE', ?,?,?,?)`,
      [id, workspaceId, userId, tunnelId, vrfName, mgmtIp,
       mangleId || null, firewallRuleIds ? JSON.stringify(firewallRuleIds) : null, now, expiresAt]
    );
  });
  return { id, expires_at: expiresAt };
}

/** Marca una sesión como CLOSED. */
async function closeSession(id) {
  const r = await query(
    `UPDATE tunnel_user_sessions SET status = 'CLOSED', deactivated_at = ?
      WHERE id = ? AND status = 'ACTIVE'`,
    [Date.now(), id]
  );
  return r.affectedRows > 0;
}

/** Sesiones ACTIVE vencidas (para el job de expiración). */
async function findExpired(now = Date.now()) {
  return query(
    `SELECT * FROM tunnel_user_sessions
      WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < ?`,
    [now]
  );
}

/** Renueva el TTL de una sesión (keepalive). */
async function touch(id, now = Date.now()) {
  await query(
    `UPDATE tunnel_user_sessions SET expires_at = ?
      WHERE id = ? AND status = 'ACTIVE'`,
    [now + TTL_MS, id]
  );
}

/** Inserta una línea de auditoría (append-only, nunca lanza hacia arriba). */
async function log({ workspaceId, sessionId, userId, tunnelId, action, mgmtIp, statusCode, message, ipAddress }) {
  try {
    await query(
      `INSERT INTO tunnel_session_logs
         (id, workspace_id, session_id, user_id, tunnel_id, action, mgmt_ip, status_code, message, ip_address, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), workspaceId, sessionId || null, userId, tunnelId, action,
       mgmtIp || null, statusCode ?? 200, message || null, ipAddress || null, Date.now()]
    );
  } catch (e) {
    console.warn('[sessionRepo.log] no se pudo registrar:', e.message);
  }
}

module.exports = {
  TTL_MS,
  getActiveByUser, getActiveByTunnel, listActiveForWorkspace, activeMapForWorkspace,
  createSession, closeSession, findExpired, touch, log,
};
