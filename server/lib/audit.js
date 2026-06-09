// ============================================================
//  Auditoría automática de acciones (Fase 3)
//  - recordTunnelLog: helper directo para registrar una acción.
//  - auditAction(action, tunnelIdFrom): middleware que registra
//    automáticamente cuando la respuesta termina con éxito (<400)
//    y existe sesión (req.account). Pensado para rutas de túneles.
// ============================================================
const auditRepo = require('../db/repos/auditRepo');
const log = require('./logger').child({ scope: 'audit' });
const { clientIp } = require('./rateLimit');
const sse = require('./sse');

/** Registro directo (no lanza si falla: la auditoría no debe romper la acción). */
async function recordTunnelLog(account, { tunnelId, action, ip, detail }) {
  if (!account?.workspace_id) return;
  try {
    await auditRepo.log({
      workspaceId: account.workspace_id,
      tunnelId,
      userId: account.sub || null,
      action,
      ip,
      detail,
    });
    // Tiempo real: notifica a todos los miembros del workspace
    sse.publish(account.workspace_id, 'tunnel', {
      tunnelId, action, userId: account.sub || null, ts: Date.now(),
    });
  } catch (e) {
    log.warn({ err: e.message, action, tunnelId }, 'no se pudo registrar la acción');
  }
}

/**
 * Middleware: audita una acción cuando la respuesta finaliza con éxito.
 * @param {string} action  ej. 'TUNNEL_ACTIVATE'
 * @param {(req)=>string} tunnelIdFrom  extrae el tunnelId del request
 */
function auditAction(action, tunnelIdFrom = (req) => req.body?.ppp_user || req.body?.vrf || req.body?.tunnelId || '') {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400 || !req.account) return;
      recordTunnelLog(req.account, {
        tunnelId: String(tunnelIdFrom(req) || ''),
        action,
        ip: clientIp(req),
        detail: null,
      });
    });
    next();
  };
}

module.exports = { recordTunnelLog, auditAction };
