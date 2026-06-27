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

// ⚠️ La línea de tiempo lee de `tunnel_session_logs` (NO de `tunnel_logs`): ahí
// es donde el sistema multiusuario escribe los eventos REALES de acceso a túnel
// (ACTIVATE/SWITCH/DEACTIVATE/EXPIRE/ERROR, vía sessionRepo.log). `tunnel_logs`
// era de un diseño de auditoría viejo (Fase 3) que nadie llena en el flujo normal
// (el middleware `auditAction` nunca se cableó) → el panel salía SIEMPRE vacío.
// Mapeo a la forma que espera el frontend: message → detail.
const SESSION_LOG_COLS =
  `sl.id, sl.tunnel_id, sl.action, sl.ip_address, sl.message AS detail, sl.created_at,
   sl.user_id, u.email AS user_email, u.name AS user_name`;

/** Línea de tiempo de auditoría del workspace (con joins de email). */
async function list(workspaceId, { limit = 100, tunnelId = null } = {}) {
  const params = [workspaceId];
  let sql =
    `SELECT ${SESSION_LOG_COLS}
       FROM tunnel_session_logs sl
       LEFT JOIN users u ON u.id = sl.user_id
      WHERE sl.workspace_id = ?`;
  if (tunnelId) { sql += ' AND sl.tunnel_id = ?'; params.push(tunnelId); }
  sql += ' ORDER BY sl.created_at DESC LIMIT ?';
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
    `SELECT ${SESSION_LOG_COLS}
       FROM tunnel_session_logs sl
       LEFT JOIN users u ON u.id = sl.user_id
      WHERE sl.workspace_id = ?`;
  if (from != null) { sql += ' AND sl.created_at >= ?'; params.push(Number(from)); }
  if (to != null)   { sql += ' AND sl.created_at <= ?'; params.push(Number(to)); }
  if (tunnelId)     { sql += ' AND sl.tunnel_id = ?'; params.push(tunnelId); }
  if (action)       { sql += ' AND sl.action = ?'; params.push(action); }
  sql += ' ORDER BY sl.created_at DESC LIMIT ?';
  params.push(Math.min(Number(maxRows) || 10000, 50000));
  return query(sql, params);
}

/**
 * Retención: borra los eventos de auditoría más viejos que `cutoffMs` (purga
 * rodante — al correr a diario, va quitando el día más antiguo). Cubre las dos
 * tablas (la nueva `tunnel_session_logs` y la vieja `tunnel_logs` por si quedan
 * filas). Devuelve el total de filas borradas.
 */
async function purgeOlderThan(cutoffMs) {
  const cutoff = Number(cutoffMs);
  let removed = 0;
  for (const table of ['tunnel_session_logs', 'tunnel_logs']) {
    try {
      const r = await query(`DELETE FROM ${table} WHERE created_at < ?`, [cutoff]);
      removed += r?.affectedRows || 0;
    } catch (_) { /* tabla ausente / best-effort: la retención no debe romper nada */ }
  }
  return removed;
}

module.exports = { log, list, listForExport, purgeOlderThan };
