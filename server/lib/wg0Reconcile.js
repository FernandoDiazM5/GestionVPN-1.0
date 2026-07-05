// ============================================================
//  wg0Reconcile.js — Reconciliación de arranque de la intención del wg0.
//
//  El hook event-driven (provision.routes.autosyncWg0) registra la LAN de una
//  torre en el archivo de intención SOLO en el instante de provisionar. Si esa
//  única escritura falla (permisos del dir, timing) o el nodo se creó ANTES de
//  que el hook existiera (§4.27, cont.10 — el caso de TorreOMAR), la LAN nunca
//  se re-registra y el VPS no la puede escanear (sale por eth0 → escaneo 0).
//
//  Este módulo cierra ese hueco: al ARRANCAR el backend, re-siembra la intención
//  con TODAS las LAN de los nodos vivos (fuente de verdad: tabla `nodes`), de
//  forma idempotente. El watcher del host la aplica (AllowedIPs + rutas de
//  kernel). Así, un simple restart/deploy recupera cualquier LAN perdida SIN
//  entrar al VPS a editar wg0 a mano.
//
//  100% best-effort y no-op natural fuera del VPS (si el dir de intención no
//  está montado). NUNCA bloquea ni rompe el arranque (§4.17).
// ============================================================
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db.service');
const { appendWg0Intent, isCidr } = require('./wg0Sync');
const log = require('./logger').child({ scope: 'wg0-reconcile' });

// Mismos defaults que el hook event-driven (provision.routes.js) para no divergir.
const WG0_INTENT_PATH = process.env.WG0_INTENT_PATH || '/wg0sync/allowedips.desired';
const WG0_AUTOSYNC = process.env.WG0_AUTOSYNC !== 'false';   // on por defecto; off explícito

/**
 * Lee TODAS las LAN de torre de la tabla `nodes` (segmento_lan + lan_subnets).
 * Fuente estable e independiente del router (que puede estar caído al arrancar).
 * @returns {Promise<string[]>} CIDR únicos y válidos.
 */
async function allTowerLans() {
  const out = new Set();
  const db = await getDb();
  const rows = await db.all('SELECT segmento_lan, lan_subnets FROM nodes');
  for (const r of rows || []) {
    if (isCidr(r.segmento_lan)) out.add(String(r.segmento_lan).trim());
    try {
      const arr = JSON.parse(r.lan_subnets || '[]');
      if (Array.isArray(arr)) arr.forEach((c) => { if (isCidr(c)) out.add(String(c).trim()); });
    } catch { /* lan_subnets malformado — se ignora */ }
  }
  return [...out];
}

/**
 * Re-siembra la intención del wg0 con todas las LAN de nodos vivos. Best-effort:
 * corre en background (`setImmediate`), nunca lanza. No-op si el autosync está
 * apagado (WG0_AUTOSYNC=false) o el dir de intención no existe (fuera del VPS).
 */
function reconcileOnStartup() {
  if (!WG0_AUTOSYNC) return;
  setImmediate(async () => {
    try {
      if (!fs.existsSync(path.dirname(WG0_INTENT_PATH))) return; // dir no montado (dev)
      const lans = await allTowerLans();
      if (lans.length === 0) { log.debug('sin LAN de nodos que reconciliar'); return; }
      const r = appendWg0Intent(WG0_INTENT_PATH, lans);
      if (r.changed) {
        log.info({ added: r.added }, 'wg0 reconcile: intención re-sembrada al arranque → el watcher del host aplicará');
      } else {
        log.debug({ total: lans.length }, 'wg0 reconcile: la intención ya contenía todas las LAN de nodos');
      }
    } catch (e) {
      // EACCES aquí = el dir de intención (bind-mount /opt/wg0-autosync) no es
      // escribible por el uid del backend (1001). Es la causa SILENCIOSA nº1 de
      // "el autosync no agrega la LAN de la torre". La elevamos a ERROR visible
      // (no warn) para que se detecte en los logs: se corrige en el host una vez
      // con  chown -R 1001:1001 /opt/wg0-autosync.
      log.error({ err: e.message, intentPath: WG0_INTENT_PATH },
        'wg0 reconcile falló al escribir la intención — ¿permisos del dir? (chown 1001:1001 /opt/wg0-autosync)');
    }
  });
}

module.exports = { reconcileOnStartup, allTowerLans };
