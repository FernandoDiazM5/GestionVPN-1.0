// ============================================================
//  mgmtAllowedIps.js — AllowedIPs split-tunnel de un peer de gestión.
//
//  Une la BASE de gestión (todo RFC1918 → planos + IPs de nodo + scan-pool +
//  LAN de torre privadas) con las LAN de torre del workspace en rango PÚBLICO
//  (ej. 142.152.7.0/24, leídas de `nodes`). Las privadas ya las cubre la base,
//  así el resultado es robusto aunque un nodo no tenga workspace_id.
//
//  ⚠️ NUNCA 0.0.0.0/0 (mataría el internet del cliente — ver mgmtNet.js).
//  ⚠️ NO modifica el address-list LIST-NET-REMOTE-TOWERS; solo LEE las LAN de BD.
// ============================================================
const { query } = require('../db/mysql');
const mgmtNet = require('./mgmtNet');

const isCidr = (s) => /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(String(s || '').trim());

// RFC1918 (privadas) — ya cubiertas por la base; solo añadimos las públicas.
const isPrivate = (c) =>
  c.startsWith('10.') || c.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(c);

/**
 * AllowedIPs split-tunnel para un peer de gestión del workspace.
 * @param {string|null} workspaceId  null → solo base + addressList.
 * @param {object} [opts]
 * @param {string[]} [opts.addressList]  CIDRs del address-list LIST-NET-REMOTE-TOWERS
 *   leídos del router (fuente autoritativa de LAN de torre — incluye nodos sin
 *   workspace_id). Solo se añaden los PÚBLICOS (los privados ya están en la base).
 * @returns {Promise<string>}  "10.0.0.0/8, ..., 142.152.7.0/24"
 */
async function mgmtAllowedIpsFor(workspaceId, opts = {}) {
  // La base puede traer varias redes separadas por coma (env MGMT_ALLOWED_IPS).
  const nets = new Set(
    String(mgmtNet.mgmtAllowedIps || '10.0.0.0/8')
      .split(',').map(s => s.trim()).filter(Boolean)
  );
  // Solo LAN en rango PÚBLICO (la base ya cubre todo RFC1918) → evita redundancia
  // y cubre casos como 142.152.7.0/24 / 142.153.0.0/24.
  const add = (s) => { const c = String(s || '').trim(); if (isCidr(c) && !isPrivate(c)) nets.add(c); };

  if (workspaceId) {
    try {
      const rows = await query(
        'SELECT segmento_lan, lan_subnets FROM nodes WHERE workspace_id = ?',
        [workspaceId]
      );
      for (const r of rows) {
        add(r.segmento_lan);
        try {
          const arr = JSON.parse(r.lan_subnets || '[]');
          if (Array.isArray(arr)) arr.forEach(add);
        } catch { /* lan_subnets malformado: ignorar */ }
      }
    } catch { /* BD inaccesible: degradar a solo la base + addressList */ }
  }

  // Entradas del address-list del router (autoritativo, incl. workspace_id NULL).
  if (Array.isArray(opts.addressList)) opts.addressList.forEach(add);

  return [...nets].join(', ');
}

/**
 * Lee los CIDR del address-list LIST-NET-REMOTE-TOWERS desde una conexión
 * RouterOS ya abierta. Best-effort: devuelve [] si falla.
 * @param {object} api   conexión node-routeros abierta
 * @param {Function} safeWrite  helper safeWrite(api, words) de routeros.service
 */
async function readTowerLans(api, safeWrite, listName = 'LIST-NET-REMOTE-TOWERS') {
  const rows = await safeWrite(api, ['/ip/firewall/address-list/print']).catch(() => []);
  return rows.filter(r => r.list === listName).map(r => r.address).filter(Boolean);
}

module.exports = { mgmtAllowedIpsFor, readTowerLans };
