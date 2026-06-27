// ============================================================
//  lib/expirationJob.js — cierre proactivo de sesiones expiradas
//
//  Hoy la expiración era LAZY: solo se cerraba al consultar /tunnel/status.
//  Si un usuario activaba un túnel y cerraba el navegador, la sesión quedaba
//  ACTIVE en BD hasta que volviera. Ahora corre cada N segundos y cierra +
//  notifica.
//
//  La mangle del USUARIO (ACCESO-USER) se cierra cuando él active otro túnel
//  (esa transacción ya limpia su mangle previa); aquí no la tocamos. SÍ
//  limpiamos best-effort la mangle de ESCANEO (SCAN-WS) cuando el workspace
//  se queda sin túnel activo, para que no sobreviva al túnel (atada al ciclo
//  del túnel, no a un timer — ver scanMangleSync). Una caída del router no
//  rompe el job (best-effort).
//
//  Config:
//     EXPIRATION_JOB_ENABLED=false   → desactiva (default: true en prod, true en dev)
//     EXPIRATION_JOB_INTERVAL_MS=60000 → cada cuánto
// ============================================================
const log = require('./logger').child({ scope: 'expiration-job' });
const sessionRepo = require('../db/repos/sessionRepo');
const auditRepo = require('../db/repos/auditRepo');
const notifier = require('./notifier');
const scanMangleSync = require('./scanMangleSync');
const sse = require('./sse');
const { getAppSetting, decryptPass } = require('../db.service');

// Retención de la "Actividad reciente": guarda como MÁXIMO los últimos N días
// (default 7) → purga rodante que va quitando el día más viejo. Se ejecuta como
// mucho 1×/hora (throttle) dentro del mismo tick del job de expiración, para no
// añadir otro interval. No es información crítica; solo sirve para ver la semana.
const RETENTION_DAYS = Math.max(1, Number(process.env.AUDIT_RETENTION_DAYS || 7));
const PURGE_THROTTLE_MS = Number(process.env.AUDIT_PURGE_THROTTLE_MS || 60 * 60 * 1000); // 1h
let _lastPurge = 0;

async function purgeOldAudit() {
  if (Date.now() - _lastPurge < PURGE_THROTTLE_MS) return;
  _lastPurge = Date.now();
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const removed = await auditRepo.purgeOlderThan(cutoff);
    if (removed) log.info({ removed, retentionDays: RETENTION_DAYS }, 'auditoría: purga de retención');
  } catch (err) {
    log.warn({ err: err.message }, 'auditoría: purga de retención falló (best-effort)');
  }
}

/** Credenciales del router core desde app_settings (igual que apPollJob). null si faltan. */
async function loadMikrotik() {
  try {
    const ip = await getAppSetting('MT_IP');
    const user = await getAppSetting('MT_USER');
    const passEnc = await getAppSetting('MT_PASS');
    return (ip && user && passEnc) ? { ip, user, pass: decryptPass(passEnc) } : null;
  } catch (_) { return null; }
}

let _handle = null;
let _running = false;

async function runOnce() {
  if (_running) return;
  _running = true;
  try {
    // Retención de auditoría (throttle interno 1×/hora). Antes del early-return de
    // abajo para que corra aunque no haya sesiones expiradas este tick.
    await purgeOldAudit();

    const expired = await sessionRepo.findExpired();
    if (!expired.length) return;
    log.info({ count: expired.length }, 'Cerrando sesiones expiradas');
    const affectedWs = new Set();
    for (const s of expired) {
      try {
        await sessionRepo.closeSession(s.id);
        affectedWs.add(s.workspace_id);
        await sessionRepo.log({
          workspaceId: s.workspace_id,
          sessionId: s.id,
          userId: s.user_id,
          tunnelId: s.tunnel_id,
          action: 'EXPIRE',
          mgmtIp: s.mgmt_ip,
          statusCode: 200,
          message: 'Cerrada por job de expiración',
        });
        // Notificación best-effort — los errores no abortan el ciclo.
        notifier.notify({
          userId: s.user_id,
          event: 'SESSION_EXPIRED',
          payload: { tunnelId: s.tunnel_id, vrf: s.vrf_name },
        }).catch((err) => log.warn({ err: err.message, userId: s.user_id }, 'notify falló'));
        // SSE 'tunnel' → la "Actividad reciente" del workspace muestra el EXPIRE en vivo.
        try { sse.publish(s.workspace_id, 'tunnel', { tunnelId: s.tunnel_id, action: 'EXPIRE', userId: s.user_id, ts: Date.now() }); } catch (_) { /* best-effort */ }
      } catch (err) {
        log.warn({ err: err.message, sessionId: s.id }, 'fallo cerrando sesión expirada');
      }
    }

    // La mangle de ESCANEO muere con el túnel: para cada workspace que se quedó
    // SIN túnel activo tras expirar, la borramos best-effort. Cargamos las creds
    // del router UNA sola vez por tick y solo si hubo expiraciones.
    let mikrotik;
    for (const ws of affectedWs) {
      try {
        const stillActive = await sessionRepo.listActiveForWorkspace(ws);
        if (stillActive.length) continue; // otro túnel sigue activo → no tocar la scan mangle
        if (mikrotik === undefined) mikrotik = await loadMikrotik();
        if (!mikrotik) break; // sin creds del router no hay nada que limpiar este tick
        await scanMangleSync.onTunnelClosed({ workspaceId: ws, mikrotik });
      } catch (err) {
        log.warn({ err: err.message, ws }, 'limpieza de scan mangle en expiración falló (best-effort)');
      }
    }
  } catch (err) {
    log.error({ err: err.message }, 'job loop falló');
  } finally {
    _running = false;
  }
}

function start() {
  if (_handle) return;
  if (process.env.EXPIRATION_JOB_ENABLED === 'false') {
    log.info('Deshabilitado por EXPIRATION_JOB_ENABLED=false');
    return;
  }
  const interval = Number(process.env.EXPIRATION_JOB_INTERVAL_MS || 60000);
  _handle = setInterval(runOnce, interval);
  log.info({ intervalMs: interval }, 'Job de expiración iniciado');
}

function stop() {
  if (_handle) {
    clearInterval(_handle);
    _handle = null;
  }
}

module.exports = { start, stop, runOnce };
