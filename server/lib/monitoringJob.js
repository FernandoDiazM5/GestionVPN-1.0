// ============================================================
//  lib/monitoringJob.js — monitoreo proactivo de nodos (M5)
//
//  Cada MONITORING_INTERVAL_MS:
//   1. Lee creds del router core (app_settings MT_*).
//   2. Conecta UNA vez y trae /ppp/active/print (set de ppp_users vivos).
//   3. Lee todos los nodos (workspace_id, ppp_user, nombre_nodo, etc).
//   4. Para cada nodo, compara contra el set:
//      - si está en el set → status 'up' (reset fail_count;
//        si venía DOWN dispara NODE_RECOVERED)
//      - si NO está → fail_count++; cuando alcanza el umbral dispara
//        NODE_DOWN + setea last_alert_at (cooldown).
//   5. Notifica al OWNER del workspace (rol = OWNER).
//
//  Anti-flap:
//   • MONITORING_FAIL_THRESHOLD polls fallidos seguidos antes de alertar
//     (default 3 → con interval 5min = 15min de gracia).
//   • MONITORING_ALERT_COOLDOWN_MS entre alertas DOWN repetidas
//     del mismo nodo (default 30min) — evita spam si el problema persiste.
//
//  El job NO escribe en RouterOS — solo lee. Tampoco modifica la tabla
//  `nodes`. Solo persiste su estado en `monitoring_state`.
// ============================================================
const log = require('./logger').child({ scope: 'monitoring-job' });
const { connectToMikrotik, safeWrite } = require('../routeros.service');
const { getDb, getAppSetting, decryptPass } = require('../db.service');
const monitoringRepo = require('../db/repos/monitoringRepo');
const notifier = require('./notifier');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FAIL_THRESHOLD = 3;
const DEFAULT_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

let _handle = null;
let _running = false;

function getCfg() {
  return {
    intervalMs: Number(process.env.MONITORING_INTERVAL_MS || DEFAULT_INTERVAL_MS),
    failThreshold: Number(process.env.MONITORING_FAIL_THRESHOLD || DEFAULT_FAIL_THRESHOLD),
    cooldownMs: Number(process.env.MONITORING_ALERT_COOLDOWN_MS || DEFAULT_ALERT_COOLDOWN_MS),
  };
}

/** Resuelve creds del router central desde app_settings. */
async function getCoreCreds() {
  const ip = await getAppSetting('MT_IP');
  const user = await getAppSetting('MT_USER');
  const passData = await getAppSetting('MT_PASS');
  if (!ip || !user || !passData) return null;
  return { ip, user, pass: decryptPass(passData) };
}

/** Devuelve el OWNER del workspace para notificar (puede haber 1). */
async function getOwnerUserId(db, workspaceId) {
  const row = await db.get(
    `SELECT user_id FROM workspace_members
      WHERE workspace_id = ? AND role = 'OWNER' AND deleted_at IS NULL
      LIMIT 1`,
    [workspaceId]
  );
  return row?.user_id || null;
}

/**
 * Ejecuta UN ciclo completo del monitor. Idempotente — si dos invocaciones
 * se solapan (raro con interval pero defensivo), el flag `_running` evita
 * concurrencia.
 */
async function runOnce() {
  if (_running) return;
  _running = true;
  try {
    const creds = await getCoreCreds();
    if (!creds) { log.debug('Sin creds MT_* — monitor en pausa.'); return; }

    let activeSet;
    let api;
    try {
      api = await connectToMikrotik(creds.ip, creds.user, creds.pass);
      const active = await safeWrite(api, ['/ppp/active/print']).catch(() => []);
      await api.close().catch(() => {});
      activeSet = new Set((active || []).map(a => a.name).filter(Boolean));
    } catch (err) {
      if (api) try { await api.close(); } catch (_) {}
      log.warn({ err: err.message }, 'No se pudo consultar /ppp/active — monitor reintentará');
      return;
    }

    const db = await getDb();
    const nodes = await db.all(
      'SELECT ppp_user, nombre_nodo, nombre_vrf, workspace_id FROM nodes WHERE workspace_id IS NOT NULL'
    );
    if (!nodes.length) return;

    const states = await monitoringRepo.listAll('node');
    const stateByKey = new Map(states.map(s => [`${s.workspace_id}::${s.target_id}`, s]));

    const cfg = getCfg();
    const now = Date.now();
    let downs = 0, recoveries = 0, alerts = 0;

    for (const node of nodes) {
      const key = `${node.workspace_id}::${node.ppp_user}`;
      const prev = stateByKey.get(key);
      const isUp = activeSet.has(node.ppp_user);

      if (isUp) {
        const wasDown = prev?.last_status === 'down';
        await monitoringRepo.recordCheck({
          workspaceId: node.workspace_id,
          targetKind: 'node',
          targetId: node.ppp_user,
          status: 'up',
          newFailCount: 0,
          now,
          recoverySent: wasDown,
        });
        if (wasDown) {
          recoveries++;
          // Cuánto tiempo estuvo caído (segundos)
          const downSeconds = prev.last_alert_at
            ? Math.floor((now - Number(prev.last_alert_at)) / 1000)
            : null;
          await notifyOwner(db, node.workspace_id, 'NODE_RECOVERED', {
            tunnelId: node.nombre_vrf || node.ppp_user,
            nodeName: node.nombre_nodo || node.ppp_user,
            downSeconds,
          });
        }
      } else {
        const newFail = (prev?.fail_count || 0) + 1;
        const lastAlertAt = prev?.last_alert_at ? Number(prev.last_alert_at) : 0;
        const reachedThreshold = newFail >= cfg.failThreshold;
        const cooldownOk = now - lastAlertAt >= cfg.cooldownMs;
        const shouldAlert = reachedThreshold && cooldownOk;
        await monitoringRepo.recordCheck({
          workspaceId: node.workspace_id,
          targetKind: 'node',
          targetId: node.ppp_user,
          status: 'down',
          newFailCount: newFail,
          now,
          alertSent: shouldAlert,
        });
        downs++;
        if (shouldAlert) {
          alerts++;
          await notifyOwner(db, node.workspace_id, 'NODE_DOWN', {
            tunnelId: node.nombre_vrf || node.ppp_user,
            nodeName: node.nombre_nodo || node.ppp_user,
            failCount: newFail,
          });
        }
      }
    }

    if (downs > 0 || recoveries > 0) {
      log.info({ checked: nodes.length, downs, recoveries, alerts }, 'monitor tick');
    }
  } catch (err) {
    log.error({ err: err.message }, 'monitor tick falló');
  } finally {
    _running = false;
  }
}

async function notifyOwner(db, workspaceId, event, payload) {
  try {
    const ownerId = await getOwnerUserId(db, workspaceId);
    if (!ownerId) return;
    await notifier.notify({ userId: ownerId, event, payload });
  } catch (err) {
    log.warn({ err: err.message, workspaceId, event }, 'notify falló');
  }
}

function start() {
  if (_handle) return;
  if (process.env.MONITORING_ENABLED === 'false') {
    log.info('Deshabilitado por MONITORING_ENABLED=false');
    return;
  }
  const cfg = getCfg();
  // Primer tick demorado para no chocar con el arranque del servidor.
  setTimeout(() => { void runOnce(); }, 15_000);
  _handle = setInterval(runOnce, cfg.intervalMs);
  log.info(cfg, 'Job de monitoreo iniciado');
}

function stop() {
  if (_handle) { clearInterval(_handle); _handle = null; }
}

module.exports = { start, stop, runOnce };
