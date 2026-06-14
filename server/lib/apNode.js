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

module.exports = { ipInCidr, resolveOwnerNodeId };
