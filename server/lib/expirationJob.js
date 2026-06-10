// ============================================================
//  lib/expirationJob.js — cierre proactivo de sesiones expiradas
//
//  Hoy la expiración era LAZY: solo se cerraba al consultar /tunnel/status.
//  Si un usuario activaba un túnel y cerraba el navegador, la sesión quedaba
//  ACTIVE en BD hasta que volviera. Ahora corre cada N segundos y cierra +
//  notifica.
//
//  No toca el router — la mangle del usuario se cierra cuando él active otro
//  túnel (esa transacción ya limpia su mangle previa). Aquí solo expiramos
//  la sesión en BD y notificamos al usuario. Es seguro: la regla de mangle
//  con una IP de gestión sin VPN activa no causa ningún acceso real.
//
//  Config:
//     EXPIRATION_JOB_ENABLED=false   → desactiva (default: true en prod, true en dev)
//     EXPIRATION_JOB_INTERVAL_MS=60000 → cada cuánto
// ============================================================
const log = require('./logger').child({ scope: 'expiration-job' });
const sessionRepo = require('../db/repos/sessionRepo');
const notifier = require('./notifier');

let _handle = null;
let _running = false;

async function runOnce() {
  if (_running) return;
  _running = true;
  try {
    const expired = await sessionRepo.findExpired();
    if (!expired.length) return;
    log.info({ count: expired.length }, 'Cerrando sesiones expiradas');
    for (const s of expired) {
      try {
        await sessionRepo.closeSession(s.id);
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
      } catch (err) {
        log.warn({ err: err.message, sessionId: s.id }, 'fallo cerrando sesión expirada');
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
