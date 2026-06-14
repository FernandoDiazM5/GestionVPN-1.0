// ============================================================
//  lib/apNode.js — relación AP → nodo VPN (Fase 2-B)
//
//  Helper compartido entre ap.routes.js y device.routes.js para
//  resolver QUÉ nodo VPN posee un AP, sin depender de que la FK
//  aps.node_id esté ya poblada (las filas viejas se resuelven en
//  caliente; las nuevas se persisten al guardar/mover).
//
//  Estrategia de resolución (en orden):
//    0. aps.node_id ya persistido  → úsalo directo (O(1))
//    1. match exacto por nombre_nodo (aps.nombre_nodo == nodes.nombre_nodo)
//    2. la IP del AP cae en la subred del nodo (ipInCidr vs segmento_lan)
//    → null si nada resuelve.
// ============================================================

/** ¿La IP cae dentro del CIDR? Tolerante a entradas inválidas. */
function ipInCidr(ip, cidr) {
    if (!ip || !cidr) return false;
    try {
        const [net, bits] = cidr.split('/');
        if (!net || !bits) return false;
        const b = 32 - parseInt(bits);
        const mask = b >= 32 ? 0 : ~((1 << b) - 1) >>> 0;
        const toInt = s => s.split('.').reduce((a, o) => ((a << 8) >>> 0) + parseInt(o), 0) >>> 0;
        return (toInt(ip) & mask) === (toInt(net) & mask);
    } catch { return false; }
}

/**
 * Devuelve el id del nodo VPN que posee este AP, o null.
 * @param db   shim de db.service (db.all/db.get)
 * @param apRow { node_id?, nombre_nodo?, ip? }
 */
async function resolveOwnerNodeId(db, apRow) {
    if (apRow && apRow.node_id) return apRow.node_id;
    const nodes = await db.all('SELECT id, nombre_nodo, segmento_lan FROM nodes');
    if (!nodes.length) return null;
    const owner =
        (apRow.nombre_nodo && nodes.find(n => n.nombre_nodo && n.nombre_nodo === apRow.nombre_nodo)) ||
        (apRow.ip && nodes.find(n => n.segmento_lan && ipInCidr(apRow.ip, n.segmento_lan))) ||
        null;
    return owner ? owner.id : null;
}

/**
 * Resuelve las credenciales SSH del NODO que posee este AP:
 *   1. nodo dueño (node_id > nombre_nodo > subred) → su node_ssh_creds
 *   2. último recurso: primer node_ssh_creds disponible
 * (Las credenciales PROPIAS del AP las maneja el caller.)
 * `decryptPass` se inyecta (de db.service) para no acoplar este módulo
 * al cifrado y mantenerlo testeable. Devuelve { user, pass, port } o null.
 */
async function resolveNodeCreds(db, apRow, decryptPass) {
  const credsForNode = async (nodeId) => {
    const rows = await db.all(
      'SELECT ssh_user, ssh_pass_enc, ssh_port FROM node_ssh_creds WHERE node_id = ? ORDER BY priority',
      [nodeId]
    );
    if (!rows.length) return null;
    return {
      user: rows[0].ssh_user || '',
      pass: rows[0].ssh_pass_enc ? decryptPass(rows[0].ssh_pass_enc) : '',
      port: rows[0].ssh_port || 22,
    };
  };
  const ownerId = await resolveOwnerNodeId(db, apRow);
  if (ownerId) {
    const c = await credsForNode(ownerId);
    if (c) return c;
  }
  const nodes = await db.all('SELECT id FROM nodes');
  for (const n of nodes) {
    const c = await credsForNode(n.id);
    if (c) return c;
  }
  return null;
}

module.exports = { ipInCidr, resolveOwnerNodeId, resolveNodeCreds };
