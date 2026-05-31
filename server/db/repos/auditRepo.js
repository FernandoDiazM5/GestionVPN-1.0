// ============================================================
//  Repositorio de auditoría de túneles (MySQL) — Fase 3
//  Tabla APPEND-ONLY. tunnel_id es textual (sobrevive soft-deletes).
// ============================================================
const crypto = require('crypto');
const { query } = require('../mysql');

async function log({ workspaceId, tunnelId, userId, action, ip, detail }) {
  await query(
    `INSERT INTO tunnel_logs (id, workspace_id, tunnel_id, user_id, action, ip_address, detail, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [crypto.randomUUID(), workspaceId, tunnelId || '', userId || null, action,
     ip || null, detail || null, Date.now()]
  );
}

/** Línea de tiempo de auditoría del workspace (con joins de email). */
async function list(workspaceId, { limit = 100, tunnelId = null } = {}) {
  const params = [workspaceId];
  let sql =
    `SELECT tl.id, tl.tunnel_id, tl.action, tl.ip_address, tl.detail, tl.created_at,
            tl.user_id, u.email AS user_email, u.name AS user_name
       FROM tunnel_logs tl
       LEFT JOIN users u ON u.id = tl.user_id
      WHERE tl.workspace_id = ?`;
  if (tunnelId) { sql += ' AND tl.tunnel_id = ?'; params.push(tunnelId); }
  sql += ' ORDER BY tl.created_at DESC LIMIT ?';
  params.push(Number(limit));
  return query(sql, params);
}

module.exports = { log, list };
