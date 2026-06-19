// ============================================================
//  lib/apPollJob.js (E1, Etapa 1) — recolección backend de CPEs.
//
//  Cada AP_POLL_INTERVAL_MS, para cada workspace con heartbeat de "watch"
//  reciente (apWatch), pollea por SSH los APs activos del workspace
//  (en lotes), persiste cpes + signal_history y publica el resultado por
//  SSE al room del workspace (evento 'ap-poll').
//
//  Cumple la política §43: el SSH a antenas vive en backend, escribe en BD
//  y el frontend lee de BD / recibe SSE. Solo pollea mientras alguien mira
//  Monitor AP (heartbeat), nunca 24/7.
//
//  Solo LECTURA sobre las antenas (pollAp = wstalist). No escribe en ellas.
// ============================================================
const log = require('./logger').child({ scope: 'ap-poll-job' });
const { getDb, getApIntId, decryptPass, getAppSetting } = require('../db.service');
const { pollAp } = require('../ap.service');
const { resolveNodeCreds } = require('./apNode');
const { persistStations, enrichStations } = require('./apPersist');
const apWatch = require('./apWatch');
const sse = require('./sse');
const scanIpRepo = require('../db/repos/scanIpRepo');
const scanMangle = require('./scanMangle');
const scanLock = require('./scanLock');

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_BATCH = 3;

let _handle = null;
let _running = false;

function getCfg() {
  return {
    intervalMs: Number(process.env.AP_POLL_INTERVAL_MS || DEFAULT_INTERVAL_MS),
    batch: Number(process.env.AP_POLL_BATCH || DEFAULT_BATCH),
    watchTtlMs: Number(process.env.AP_POLL_WATCH_TTL_MS || apWatch.DEFAULT_TTL_MS),
  };
}

/** Resuelve credenciales del AP: propias > nodo dueño. */
async function credsFor(db, ap) {
  if (ap.usuario_ssh) {
    return { user: ap.usuario_ssh, pass: ap.clave_ssh_enc ? decryptPass(ap.clave_ssh_enc) : '', port: ap.puerto_ssh || 22 };
  }
  return resolveNodeCreds(db, ap, decryptPass);
}

async function pollOne(db, workspaceId, ap, localAddress = null) {
  const creds = await credsFor(db, ap);
  if (!creds || !creds.user) return;
  let stations;
  try {
    stations = await pollAp(ap.uuid, ap.ip, creds.port || ap.puerto_ssh || 22, creds.user, creds.pass, ap.firmware || '', localAddress);
  } catch (e) {
    sse.publish(workspaceId, 'ap-poll', { apId: ap.uuid, error: e.message, polledAt: Date.now() });
    return;
  }
  const apIntId = ap.id || await getApIntId(ap.uuid);
  await persistStations(db, apIntId, stations, /* saveHistory */ true);
  const enriched = await enrichStations(db, stations);
  sse.publish(workspaceId, 'ap-poll', { apId: ap.uuid, stations: enriched, polledAt: Date.now() });
}

/** Credenciales del router core desde app_settings (igual que monitoringJob). */
async function loadMikrotik() {
  const ip = await getAppSetting('MT_IP');
  const user = await getAppSetting('MT_USER');
  const passEnc = await getAppSetting('MT_PASS');
  return (ip && user && passEnc) ? { ip, user, pass: decryptPass(passEnc) } : null;
}

/** Poll en lotes sin Option C (dev local: el backend ES la máquina del moderador). */
async function pollLegacy(db, ws, aps, batch) {
  for (let i = 0; i < aps.length; i += batch) {
    await Promise.allSettled(aps.slice(i, i + batch).map(ap => pollOne(db, ws, ap)));
  }
}

/**
 * Poll con Opción C: agrupa los APs por VRF y, bajo el lock del workspace,
 * conmuta la mangle (src=scan-IP → VRF) por grupo y pollea esos APs atando el
 * SSH a la scan-IP. El lock serializa contra el escaneo interactivo del mismo
 * workspace (misma scan-IP = una sola mangle activa a la vez).
 */
async function pollOptionC(db, ws, aps, batch, scanIp, mikrotik) {
  const byVrf = new Map();
  const noVrf = [];
  for (const ap of aps) {
    if (ap.nombre_vrf) {
      if (!byVrf.has(ap.nombre_vrf)) byVrf.set(ap.nombre_vrf, []);
      byVrf.get(ap.nombre_vrf).push(ap);
    } else {
      noVrf.push(ap);
    }
  }

  await scanLock.withLock(ws, async () => {
    for (const [vrf, vrfAps] of byVrf) {
      try {
        await scanMangle.setup({ workspaceId: ws, scanIp, vrfName: vrf, mikrotik });
      } catch (e) {
        log.warn({ ws, vrf, err: e.message }, 'no se pudo montar la scan mangle (grupo omitido)');
        continue;
      }
      for (let i = 0; i < vrfAps.length; i += batch) {
        await Promise.allSettled(vrfAps.slice(i, i + batch).map(ap => pollOne(db, ws, ap, scanIp)));
      }
    }
    await scanMangle.teardown({ workspaceId: ws, mikrotik });
  });

  // APs sin VRF asignado (node_id null): poll legacy (no rutea desde el VPS).
  if (noVrf.length) await pollLegacy(db, ws, noVrf, batch);
}

/** Un ciclo: pollea los APs activos de cada workspace observado. */
async function runOnce() {
  if (_running) return;
  _running = true;
  try {
    const cfg = getCfg();
    const wss = apWatch.watchedWorkspaces(cfg.watchTtlMs);
    if (!wss.length) return;

    const db = await getDb();
    for (const ws of wss) {
      const aps = await db.all(
        `SELECT a.id, a.uuid, a.ip, a.usuario_ssh, a.clave_ssh_enc, a.puerto_ssh,
                a.node_id, a.nombre_nodo, a.firmware, n.nombre_vrf AS nombre_vrf
           FROM aps a JOIN ap_groups g ON g.id = a.ap_group_id
           LEFT JOIN nodes n ON n.id = a.node_id
          WHERE a.is_active = 1 AND g.workspace_id = ?`,
        [ws]
      );
      if (!aps.length) continue;

      // Opción C activa si el workspace tiene scan-IP y el router está configurado.
      const scanIp = await scanIpRepo.resolveForWorkspace(ws).catch(() => null);
      const mikrotik = scanIp ? await loadMikrotik() : null;

      if (scanIp && mikrotik) {
        await pollOptionC(db, ws, aps, cfg.batch, scanIp, mikrotik);
      } else {
        await pollLegacy(db, ws, aps, cfg.batch);
      }
    }
  } catch (err) {
    log.error({ err: err.message }, 'ap-poll tick falló');
  } finally {
    _running = false;
  }
}

function start() {
  if (_handle) return;
  if (process.env.AP_POLL_ENABLED === 'false') {
    log.info('Deshabilitado por AP_POLL_ENABLED=false');
    return;
  }
  const cfg = getCfg();
  _handle = setInterval(runOnce, cfg.intervalMs);
  log.info(cfg, 'Job de polling de APs iniciado (E1)');
}

function stop() {
  if (_handle) { clearInterval(_handle); _handle = null; }
}

module.exports = { start, stop, runOnce };
