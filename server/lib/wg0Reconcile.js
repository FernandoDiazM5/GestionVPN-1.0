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
const { appendWg0Intent } = require('./wg0Sync');
const { normalizeCidr } = require('./ipv4Cidr');
const log = require('./logger').child({ scope: 'wg0-reconcile' });

// Mismos defaults que el hook event-driven (provision.routes.js) para no divergir.
const WG0_INTENT_PATH = process.env.WG0_INTENT_PATH || '/wg0sync/allowedips.desired';
const WG0_AUTOSYNC = process.env.WG0_AUTOSYNC !== 'false';   // on por defecto; off explícito
const WG0_RECONCILE_INTERVAL_MS = Math.max(60_000,
  Number(process.env.WG0_RECONCILE_INTERVAL_MS) || 10 * 60_000);
let reconcileTimer = null;
let reconcileRunning = false;

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
    const primary = normalizeCidr(r.segmento_lan, { allowHost: false });
    if (primary) out.add(primary);
    try {
      const arr = JSON.parse(r.lan_subnets || '[]');
      if (Array.isArray(arr)) arr.forEach((c) => {
        const normalized = normalizeCidr(c, { allowHost: false });
        if (normalized) out.add(normalized);
      });
    } catch { /* lan_subnets malformado — se ignora */ }
  }
  return [...out];
}

/**
 * Re-siembra la intención del wg0 con todas las LAN de nodos vivos. Best-effort:
 * corre en background (`setImmediate`), nunca lanza. No-op si el autosync está
 * apagado (WG0_AUTOSYNC=false) o el dir de intención no existe (fuera del VPS).
 */
async function reconcileNow() {
  if (!WG0_AUTOSYNC || reconcileRunning) return { skipped: true };
  reconcileRunning = true;
  try {
    if (!fs.existsSync(path.dirname(WG0_INTENT_PATH))) return { skipped: true };
    const lans = await allTowerLans();
    if (lans.length === 0) return { changed: false, added: [], total: 0 };
    const result = appendWg0Intent(WG0_INTENT_PATH, lans);
    if (result.changed) log.info({ added: result.added }, 'wg0 reconcile: intención re-sembrada');
    else log.debug({ total: lans.length }, 'wg0 reconcile: intención completa');
    return { ...result, total: lans.length };
  } catch (e) {
    log.error({ err: e.message, intentPath: WG0_INTENT_PATH },
      'wg0 reconcile falló al escribir la intención — revisar permisos/montaje');
    return { changed: false, error: e.message };
  } finally {
    reconcileRunning = false;
  }
}

function reconcileOnStartup() {
  if (WG0_AUTOSYNC) setImmediate(() => { reconcileNow(); });
}

function startPeriodicReconcile() {
  if (!WG0_AUTOSYNC || reconcileTimer) return reconcileTimer;
  reconcileTimer = setInterval(() => { reconcileNow(); }, WG0_RECONCILE_INTERVAL_MS);
  reconcileTimer.unref?.();
  return reconcileTimer;
}

function stopPeriodicReconcile() {
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = null;
}

module.exports = {
  reconcileOnStartup, startPeriodicReconcile, stopPeriodicReconcile, reconcileNow, allTowerLans,
};
