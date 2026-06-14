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
const { getDb, getApIntId, decryptPass } = require('../db.service');
const { pollAp } = require('../ap.service');
const { resolveNodeCreds } = require('./apNode');
const { persistStations, enrichStations } = require('./apPersist');
const apWatch = require('./apWatch');
const sse = require('./sse');

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

async function pollOne(db, workspaceId, ap) {
  const creds = await credsFor(db, ap);
  if (!creds || !creds.user) return;
  let stations;
  try {
    stations = await pollAp(ap.uuid, ap.ip, creds.port || ap.puerto_ssh || 22, creds.user, creds.pass, ap.firmware || '');
  } catch (e) {
    sse.publish(workspaceId, 'ap-poll', { apId: ap.uuid, error: e.message, polledAt: Date.now() });
    return;
  }
  const apIntId = ap.id || await getApIntId(ap.uuid);
  await persistStations(db, apIntId, stations, /* saveHistory */ true);
  const enriched = await enrichStations(db, stations);
  sse.publish(workspaceId, 'ap-poll', { apId: ap.uuid, stations: enriched, polledAt: Date.now() });
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
                a.node_id, a.nombre_nodo, a.firmware
           FROM aps a JOIN ap_groups g ON g.id = a.ap_group_id
          WHERE a.is_active = 1 AND g.workspace_id = ?`,
        [ws]
      );
      for (let i = 0; i < aps.length; i += cfg.batch) {
        await Promise.allSettled(aps.slice(i, i + cfg.batch).map(ap => pollOne(db, ws, ap)));
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
