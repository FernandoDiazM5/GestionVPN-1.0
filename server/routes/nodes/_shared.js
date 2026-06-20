// ============================================================
//  routes/nodes/_shared.js — helpers compartidos por sub-routers
//
//  Extraído del antiguo node.routes.js durante FASE 6 del refactor:
//   - annotateSessions:        anota cada nodo con running_by_you y
//                              active_by_other (visibilidad por rol).
//   - filterNodesForRole:      aplica aislamiento multi-tenant.
//   - nodeBelongsToRequester:  guarda anti-cross-workspace para mutaciones.
//   - requireOperator:         middleware Bearer legacy (admin/operator).
// ============================================================

const { getDb } = require('../../db.service');
const assignmentRepo = require('../../db/repos/assignmentRepo');
const sessionRepo = require('../../db/repos/sessionRepo');
const { isModerator } = require('../../lib/routeGuards');

/**
 * Anota cada nodo con el estado de sesión POR USUARIO, SIN tocar `running`.
 *
 * IMPORTANTE: `running` = conectividad de la TORRE al core (SSTP/WG levantado).
 * Es independiente de si un usuario activó su acceso de ruteo. NO se sobrescribe,
 * porque hacerlo ocultaría el estado real de conexión de la torre.
 *
 *   - running_by_you: el usuario actual tiene este túnel activo (su mangle)
 *   - active_by_other: (solo admin) usuario que lo tiene activo, o null
 */
async function annotateSessions(req, nodes) {
  const acc = req.account;
  if (!acc?.sub || !acc?.workspace_id) return nodes;
  let activeMap;
  try {
    activeMap = await sessionRepo.activeMapForWorkspace(acc.workspace_id);
  } catch (_) {
    return nodes; // si falla, no anotamos (no exponemos estado de otros)
  }
  const isAdmin = !!acc.platform_admin;
  return nodes.map(n => {
    const sess = activeMap.get(n.nombre_vrf) || activeMap.get(n.ppp_user);
    const mine = !!sess && sess.user_id === acc.sub;
    return {
      ...n,
      running_by_you: mine,
      // Para no-admin NO se revela que otro lo usa (privacidad). Admin sí lo ve.
      active_by_other: isAdmin && sess && !mine ? (sess.user_name || sess.user_email || 'otro usuario') : null,
      // `running` se conserva tal cual (conectividad de la torre) — NO se sobrescribe.
    };
  });
}

/**
 * Filtra los nodos según el rol RBAC (Roles v2) con aislamiento multi-tenant:
 *  - Admin de plataforma: ve TODOS los túneles del router.
 *  - Moderador (OWNER/CO_MODERATOR): solo los nodos de SU workspace
 *    (nodes.workspace_id = su workspace).
 *  - View (MEMBER): solo sus túneles asignados, dentro de su workspace.
 * Ante error de DB no expone túneles (seguro por defecto) para roles no-admin.
 */
async function filterNodesForRole(req, nodes) {
  const acc = req.account;
  if (!acc) return nodes;                 // token legacy sin RBAC
  if (acc.platform_admin) return nodes;   // Administrador ve todo

  // Conjunto de identificadores (ppp_user / nombre_vrf) que pertenecen al workspace
  let wsUsers;
  try {
    const db = await getDb();
    const rows = await db.all(
      'SELECT ppp_user, nombre_vrf FROM nodes WHERE workspace_id = ?',
      [acc.workspace_id]
    );
    wsUsers = new Set();
    rows.forEach(r => { if (r.ppp_user) wsUsers.add(r.ppp_user); if (r.nombre_vrf) wsUsers.add(r.nombre_vrf); });
  } catch (_) {
    return [];   // sin poder verificar pertenencia → no exponer
  }
  let scoped = nodes.filter(n => wsUsers.has(n.ppp_user) || wsUsers.has(n.nombre_vrf));

  if (acc.role === 'MEMBER') {
    try {
      const ids = new Set(await assignmentRepo.assignedTunnelIds(acc.workspace_id, acc.sub));
      scoped = scoped.filter(n => ids.has(n.nombre_vrf) || ids.has(n.ppp_user));
    } catch (_) {
      return [];
    }
  }
  return scoped;
}

/**
 * Verifica que el nodo (por ppp_user) pertenezca al workspace del solicitante.
 * Admin de plataforma y tokens legacy (sin RBAC) no tienen restricción.
 * Impide que un moderador mute/borre túneles de OTRO workspace por ppp_user.
 */
async function nodeBelongsToRequester(req, pppUser) {
  const acc = req.account;
  if (!acc || acc.platform_admin) return true;
  if (!pppUser) return false;
  try {
    const db = await getDb();
    const row = await db.get('SELECT workspace_id FROM nodes WHERE ppp_user = ?', [pppUser]);
    return !!row && row.workspace_id === acc.workspace_id;
  } catch (_) {
    return false;
  }
}

/**
 * Middleware: solo moderadores (OWNER/CO_MODERATOR) o platform_admin mutan nodos.
 * M2: deriva de req.account (RBAC). Antes miraba req.user.role (admin/operator),
 * mapeado por mapRbacRole, que conflaba OWNER/CO_MOD→'admin' (riesgo tipo A2).
 */
function requireOperator(req, res, next) {
  if (isModerator(req)) return next();
  return res.status(403).json({ success: false, message: 'Acceso denegado: se requiere rol de operador o admin' });
}

module.exports = {
  annotateSessions,
  filterNodesForRole,
  nodeBelongsToRequester,
  requireOperator,
};
