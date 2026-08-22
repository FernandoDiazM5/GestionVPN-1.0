// ============================================================
//  lib/expirationJob.js — cierre proactivo de sesiones expiradas
//
//  El lease se renueva mientras el navegador sigue trabajando. Al vencer,
//  este job elimina primero la mangle del USUARIO (ACCESO-USER) en MikroTik
//  y sólo entonces cierra MySQL. Si RouterOS falla, conserva ACTIVE y
//  reintenta. También limpia best-effort la mangle de ESCANEO (SCAN-WS)
//  cuando el workspace se queda sin túneles activos.
//
//  Config:
//     EXPIRATION_JOB_ENABLED=false   → desactiva (default: true en prod, true en dev)
//     EXPIRATION_JOB_INTERVAL_MS=30000 → cada cuánto
// ============================================================
const log = require('./logger').child({ scope: 'expiration-job' });
const sessionRepo = require('../db/repos/sessionRepo');
const auditRepo = require('../db/repos/auditRepo');
const aiAnalysisRepo = require('../db/repos/aiAnalysisRepo');
const aiSnapshotRepo = require('../db/repos/aiSnapshotRepo');
const scanMangleSync = require('./scanMangleSync');
const { loadCoreMikrotik } = require('./coreMikrotikSettings');
const { analysisRetentionDays, snapshotRetentionDays } = require('./ai/aiRetention');
const authSessionRepo = require('../db/repos/authSessionRepo');
const tunnelService = require('./tunnelService');
const platformSecurityRepo = require('../db/repos/platformSecurityRepo');

// Retención de la "Actividad reciente": guarda como MÁXIMO los últimos 7 días
// → purga rodante que va quitando el día más viejo. Se ejecuta como
// mucho 1×/hora (throttle) dentro del mismo tick del job de expiración, para no
// añadir otro interval. No es información crítica; solo sirve para ver la semana.
const PURGE_THROTTLE_MS = Number(process.env.AUDIT_PURGE_THROTTLE_MS || 5 * 60 * 1000); // 5 min
let _lastPurge = 0;
let _lastAiPurge = 0;
let _lastSecurityPurge = 0;

async function purgeOldSecurityAudit() {
  if (Date.now() - _lastSecurityPurge < PURGE_THROTTLE_MS) return;
  _lastSecurityPurge = Date.now();
  await platformSecurityRepo.purgeOlderThan(Date.now() - 365 * 86400000).catch(error => {
    log.warn({ code: error?.code || 'UNKNOWN' }, 'seguridad VPS: purga de auditoría falló (best-effort)');
  });
}

async function purgeOldAudit() {
  if (Date.now() - _lastPurge < PURGE_THROTTLE_MS) return;
  _lastPurge = Date.now();
  try {
    const cutoff = auditRepo.retentionCutoff();
    const removed = await auditRepo.purgeOlderThan(cutoff);
    if (removed) log.info({ removed, retentionDays: auditRepo.AUDIT_RETENTION_DAYS }, 'auditoría: purga de retención');
  } catch (err) {
    log.warn({ err: err.message }, 'auditoría: purga de retención falló (best-effort)');
  }
}

async function purgeOldAiData() {
  if (Date.now() - _lastAiPurge < PURGE_THROTTLE_MS) return;
  _lastAiPurge = Date.now();
  const analysisDays = analysisRetentionDays();
  const snapshotDays = snapshotRetentionDays();
  try {
    const analyses = await aiAnalysisRepo.purgeOlderThan(Date.now() - analysisDays * 86400000);
    const snapshots = await aiSnapshotRepo.purgeExpired(Date.now(), snapshotDays);
    if (analyses || snapshots) {
      log.info({ analyses, snapshots, analysisDays, snapshotDays }, 'Gemini AirOS: purga de retención');
    }
  } catch (err) {
    log.warn({ err: err.message }, 'Gemini AirOS: purga de retención falló (best-effort)');
  }
}

/** Credenciales del router core desde app_settings (igual que apPollJob). null si faltan. */
async function loadMikrotik() {
  return loadCoreMikrotik();
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
    await purgeOldSecurityAudit();
    await purgeOldAiData();
    await authSessionRepo.purgeExpired().catch(error => {
      log.warn({ code: error?.code || 'UNKNOWN' }, 'sesiones web: purga falló (best-effort)');
    });

    const expired = await sessionRepo.findExpired();
    if (!expired.length) return;
    log.info({ count: expired.length }, 'Cerrando sesiones expiradas');
    const affectedWs = new Set();
    const mikrotik = await loadMikrotik();
    // Lotes pequeños: usuarios distintos progresan en paralelo sin lanzar una
    // ráfaga ilimitada de conexiones contra RouterOS.
    for (let offset = 0; offset < expired.length; offset += 3) {
      const batch = expired.slice(offset, offset + 3);
      await Promise.all(batch.map(async (s) => {
        try {
          if (!mikrotik) throw new Error('MikroTik no configurado');
          const result = await tunnelService.deactivateTunnel({
            account: { sub: s.user_id, workspace_id: s.workspace_id },
            mikrotik,
            action: 'EXPIRE',
            onlyIfExpired: true,
          });
          if (!result.ok) throw new Error(result.message);
          if (!result.skipped) affectedWs.add(s.workspace_id);
        } catch (err) {
          // Fail closed: conservar ACTIVE permite reintentar en el siguiente
          // tick. Nunca declarar cerrado mientras la mangle pueda seguir viva.
          log.warn({ err: err.message, sessionId: s.id }, 'fallo revocando sesión expirada; se reintentará');
        }
      }));
    }

    // La mangle de ESCANEO muere con el túnel: para cada workspace que se quedó
    // SIN túnel activo tras expirar, la borramos best-effort. Cargamos las creds
    // del router UNA sola vez por tick y solo si hubo expiraciones.
    for (const ws of affectedWs) {
      try {
        const stillActive = await sessionRepo.listActiveForWorkspace(ws);
        if (stillActive.length) continue; // otro túnel sigue activo → no tocar la scan mangle
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
  const interval = Math.max(10_000, Number(process.env.EXPIRATION_JOB_INTERVAL_MS || 30_000));
  // Ejecutar también al arrancar: no esperar al primer intervalo para aplicar
  // la retención de 7 días después de un reinicio o despliegue.
  void runOnce();
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
