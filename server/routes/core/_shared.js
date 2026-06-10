// ============================================================
//  routes/core/_shared.js — registry SSE + helpers de túnel
//
//  Extraído del antiguo core.routes.js durante FASE 7 del refactor.
//
//  ★ El registry SSE es SINGLETON deliberado: vive en este módulo
//    para que `tunnel.activate` (escribe) y `tunnel.events` (lee)
//    compartan el MISMO Map. Si los sub-routers crearan cada uno
//    su propio Map, los eventos NUNCA llegarían al cliente.
// ============================================================

const { getDb } = require('../../db.service');
const assignmentRepo = require('../../db/repos/assignmentRepo');

// ── SSE: clientes suscritos POR USUARIO (aislamiento de eventos) ─────────────
//  Map<userId, Set<res>>. Cada usuario solo recibe SUS eventos de túnel.
const sseClientsByUser = new Map();

function addSseClient(userId, res) {
  if (!sseClientsByUser.has(userId)) sseClientsByUser.set(userId, new Set());
  sseClientsByUser.get(userId).add(res);
}
function removeSseClient(userId, res) {
  const set = sseClientsByUser.get(userId);
  if (set) { set.delete(res); if (set.size === 0) sseClientsByUser.delete(userId); }
}
/** Emite el estado de túnel SOLO al usuario indicado (todas sus pestañas). */
function emitToUser(userId, activeNodeVrf, tunnelExpiry) {
  const set = sseClientsByUser.get(userId);
  if (!set) return;
  const payload = JSON.stringify({ activeNodeVrf: activeNodeVrf || null, tunnelExpiry: tunnelExpiry || null });
  for (const client of set) {
    try { client.write(`data: ${payload}\n\n`); } catch (_) { set.delete(client); }
  }
}

/** IP del cliente HTTP (forense en logs), normalizada. */
function clientIpOf(req) {
  const xf = req.headers['x-forwarded-for'];
  const raw = xf ? xf.split(',')[0] : (req.socket?.remoteAddress || '');
  return raw.trim().replace(/^::ffff:/i, '').trim();
}

/**
 * ¿Puede el usuario autenticado usar (activar) este VRF?
 *  - platform_admin: cualquiera.
 *  - OWNER/CO_MOD: nodos de su workspace.
 *  - MEMBER: solo túneles asignados (tunnel_assignments).
 * @returns {Promise<{ok:boolean, code?:number, msg?:string, node?:object}>}
 */
async function canUseTunnel(req, vrfName) {
  const acc = req.account;
  if (!acc) return { ok: false, code: 401, msg: 'No autenticado' };
  if (acc.platform_admin) return { ok: true, node: null };
  let node;
  try {
    const db = await getDb();
    node = await db.get('SELECT ppp_user, nombre_vrf, workspace_id FROM nodes WHERE nombre_vrf = ?', [vrfName]);
  } catch (_) {
    return { ok: false, code: 500, msg: 'Error consultando el nodo' };
  }
  if (!node) return { ok: false, code: 404, msg: 'Túnel no encontrado' };
  if (node.workspace_id !== acc.workspace_id) return { ok: false, code: 403, msg: 'Túnel fuera de tu workspace' };
  if (acc.role === 'MEMBER') {
    try {
      const ids = await assignmentRepo.assignedTunnelIds(acc.workspace_id, acc.sub);
      if (!ids.includes(node.nombre_vrf) && !ids.includes(node.ppp_user)) {
        return { ok: false, code: 403, msg: 'Túnel no asignado a tu usuario' };
      }
    } catch (_) {
      return { ok: false, code: 403, msg: 'No se pudo verificar la asignación' };
    }
  }
  return { ok: true, node };
}

module.exports = {
  addSseClient,
  removeSseClient,
  emitToUser,
  clientIpOf,
  canUseTunnel,
};
