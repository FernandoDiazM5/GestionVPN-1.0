// ============================================================
//  ipAlloc.js — asignación del último octeto de una IP de gestión.
//  Reutiliza huecos: devuelve el MENOR octeto libre >= start (antes era
//  max+1, que nunca reutilizaba las IPs de usuarios borrados → agotaba el pool).
// ============================================================

/**
 * @param {number[]} used   últimos octetos ya ocupados (ej. [20, 21, 23])
 * @param {number}   start  primer octeto del pool (ej. 20)
 * @param {number}   end    último octeto permitido (default 254)
 * @returns {number} menor octeto libre en [start, end]
 * @throws si el pool está agotado
 */
function lowestFreeOctet(used, start, end = 254) {
  const set = new Set((used || []).filter(n => Number.isInteger(n)));
  for (let n = start; n <= end; n++) {
    if (!set.has(n)) return n;
  }
  throw new Error(`Pool de IPs de gestión agotado (${start}-${end})`);
}

module.exports = { lowestFreeOctet };
