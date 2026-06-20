// ============================================================
//  addressList.js — dedup de entradas de address-list (LIST-NET-REMOTE-TOWERS).
//
//  RouterOS NO rechaza direcciones duplicadas en un address-list: cada `/add`
//  crea una entrada nueva aunque la dirección ya exista. Como varias torres
//  comparten la misma LAN (p.ej. 142.152.7.0/24 en 6 nodos), el address-list
//  acumulaba la misma dirección N veces. La lista es un test de PERTENENCIA
//  (dst-address-list en mangle + filtro forward) → con UNA entrada basta.
//
//  Helper PURO: dada la lista actual del router y las direcciones deseadas,
//  devuelve solo las que faltan (sin duplicar dentro del propio lote).
// ============================================================

/**
 * @param {Array<{list?:string,address?:string}>} existing — address-list/print del router
 * @param {string} list      — nombre de la lista (LIST-NET-REMOTE-TOWERS)
 * @param {string[]} addresses — direcciones a asegurar en la lista
 * @returns {string[]} las direcciones que faltan (a añadir), sin repetidos
 */
function entriesToAdd(existing, list, addresses) {
  const present = new Set(
    (existing || [])
      .filter(a => a && a.list === list && a.address != null)
      .map(a => String(a.address).trim())
  );
  const out = [];
  const seen = new Set();
  for (const addr of (addresses || [])) {
    const a = String(addr || '').trim();
    if (!a || present.has(a) || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

module.exports = { entriesToAdd };
