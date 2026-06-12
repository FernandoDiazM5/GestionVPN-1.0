// ============================================================
//  monitoringRepo — estado de monitoreo proactivo (M5)
//
//  Una fila por (workspace_id, target_kind, target_id).
//  El job se encarga de upsert tras cada poll.
// ============================================================
const { query } = require('../mysql');

const logger = require('../../lib/logger').child({ scope: 'monitoring-repo' });

function isNoTableErr(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn['’]t exist/i.test(err.message || ''));
}
let _warnedNoTable = false;
function warnOnceNoTable() {
  if (_warnedNoTable) return;
  _warnedNoTable = true;
  logger.warn('Tabla monitoring_state aún no existe. Corre `cd server && npm run migrate:monitoring`.');
}

/** Devuelve filas existentes para una lista de targets de un workspace. */
async function listByWorkspace(workspaceId, targetKind) {
  try {
    return await query(
      `SELECT * FROM monitoring_state
        WHERE workspace_id = ? AND target_kind = ?`,
      [workspaceId, targetKind]
    );
  } catch (err) {
    if (isNoTableErr(err)) { warnOnceNoTable(); return []; }
    throw err;
  }
}

/** Devuelve TODAS las filas (para el job global por workspace). */
async function listAll(targetKind) {
  try {
    return await query(
      `SELECT * FROM monitoring_state WHERE target_kind = ?`,
      [targetKind]
    );
  } catch (err) {
    if (isNoTableErr(err)) { warnOnceNoTable(); return []; }
    throw err;
  }
}

/**
 * Upsert tras un poll. Si la fila no existe se inserta con last_status.
 * Devuelve el estado anterior (o null si era la primera vez) para que el
 * caller decida si dispara NODE_DOWN / NODE_RECOVERED.
 */
async function recordCheck({
  workspaceId, targetKind, targetId,
  status,                    // 'up' | 'down'
  newFailCount,              // entero ≥ 0
  now = Date.now(),
  alertSent = false,         // si true, actualiza last_alert_at
  recoverySent = false,      // si true, actualiza last_recovery_at
}) {
  try {
    await query(
      `INSERT INTO monitoring_state
         (workspace_id, target_kind, target_id, last_status, fail_count,
          last_check_at, last_alert_at, last_recovery_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_status = VALUES(last_status),
         fail_count = VALUES(fail_count),
         last_check_at = VALUES(last_check_at),
         last_alert_at = IF(VALUES(last_alert_at) IS NULL, last_alert_at, VALUES(last_alert_at)),
         last_recovery_at = IF(VALUES(last_recovery_at) IS NULL, last_recovery_at, VALUES(last_recovery_at))`,
      [
        workspaceId, targetKind, targetId, status, newFailCount,
        now,
        alertSent ? now : null,
        recoverySent ? now : null,
      ]
    );
  } catch (err) {
    if (isNoTableErr(err)) { warnOnceNoTable(); return; }
    throw err;
  }
}

module.exports = { listByWorkspace, listAll, recordCheck };
