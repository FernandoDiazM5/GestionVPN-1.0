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

/**
 * Lista para EXPORT (Q4) — sin LIMIT (techo configurable), filtros de rango,
 * acción y túnel. Misma forma de fila que list() para reutilizar tipos.
 *
 * NO se pagina: el caller (export endpoint) controla el techo con `maxRows`.
 * El índice idx_tl_ws_created hace que el filtro por created_at sea barato
 * incluso con miles de filas.
 */
async function listForExport(workspaceId, { from, to, tunnelId = null, action = null, maxRows = 10000 } = {}) {
  const params = [workspaceId];
  let sql =
    `SELECT tl.id, tl.tunnel_id, tl.action, tl.ip_address, tl.detail, tl.created_at,
            tl.user_id, u.email AS user_email, u.name AS user_name
       FROM tunnel_logs tl
       LEFT JOIN users u ON u.id = tl.user_id
      WHERE tl.workspace_id = ?`;
  if (from != null) { sql += ' AND tl.created_at >= ?'; params.push(Number(from)); }
  if (to != null)   { sql += ' AND tl.created_at <= ?'; params.push(Number(to)); }
  if (tunnelId)     { sql += ' AND tl.tunnel_id = ?'; params.push(tunnelId); }
  if (action)       { sql += ' AND tl.action = ?'; params.push(action); }
  sql += ' ORDER BY tl.created_at DESC LIMIT ?';
  params.push(Math.min(Number(maxRows) || 10000, 50000));
  return query(sql, params);
}

module.exports = { log, list, listForExport };
