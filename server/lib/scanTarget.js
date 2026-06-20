// ============================================================
//  scanTarget.js — resolución del VRF a escanear.
//
//  Con LANs solapadas entre nodos (varias torres comparten la misma LAN, p.ej.
//  142.152.7.0/24 vive en 6 nodos distintos), el "primer nodo que posee la
//  subred" NO es necesariamente el nodo que el usuario tiene activo. Este helper
//  PREFIERE el VRF de la sesión activa del usuario y solo cae al primer match por
//  subred si no hay sesión activa sobre esa LAN. Así el escaneo siempre apunta al
//  túnel que el moderador realmente tiene abierto (objetivos: nodo independiente
//  + escanear el túnel activo como usuario).
// ============================================================

/** Subredes (segmento_lan + lan_subnets) de una fila de nodo, normalizadas. */
function lanSetOf(row) {
  const subs = new Set();
  if (row.segmento_lan) subs.add(String(row.segmento_lan).trim());
  try {
    (JSON.parse(row.lan_subnets || '[]') || []).forEach(s => subs.add(String(s).trim()));
  } catch (_) { /* lan_subnets corrupto → solo segmento_lan */ }
  return subs;
}

/**
 * Resuelve el VRF a escanear para (workspace, usuario, nodeLan).
 *
 * @param {object} args
 * @param {{all:Function}} args.db                 — getDb()
 * @param {{getActiveByUser:Function}} args.sessionRepo
 * @param {string} args.workspaceId
 * @param {string} args.userId
 * @param {string} args.nodeLan                    — CIDR a escanear
 * @returns {Promise<{ owns: boolean, vrf: string|null }>}
 *   owns=false → la subred no pertenece a ningún nodo del workspace (→ 403).
 */
async function resolveScanTargetVrf({ db, sessionRepo, workspaceId, userId, nodeLan }) {
  const target = String(nodeLan || '').trim();
  const rows = await db.all(
    'SELECT ppp_user, nombre_vrf, segmento_lan, lan_subnets FROM nodes WHERE workspace_id = ?',
    [workspaceId]
  );
  const owners = rows.filter(r => lanSetOf(r).has(target));
  if (owners.length === 0) return { owns: false, vrf: null };

  // PREFERIR el VRF del túnel activo del usuario si una de las torres con esta
  // LAN es la que tiene abierta. Decisivo cuando la LAN se solapa entre nodos.
  if (sessionRepo && userId) {
    try {
      const active = await sessionRepo.getActiveByUser(workspaceId, userId);
      if (active && active.vrf_name) {
        const match = owners.find(r => r.nombre_vrf === active.vrf_name);
        if (match) return { owns: true, vrf: match.nombre_vrf || null };
      }
    } catch (_) { /* sin sesión legible → fallback determinístico */ }
  }

  // Fallback: primer nodo que posee la subred (comportamiento previo).
  return { owns: true, vrf: owners[0].nombre_vrf || null };
}

module.exports = { resolveScanTargetVrf, lanSetOf };
