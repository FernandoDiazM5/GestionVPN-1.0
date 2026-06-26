// ============================================================
//  routes/nodes/scan.routes.js — escaneo SSE de subred remota
//
//   POST /node/scan-stream  → SSE con Worker thread
//
//  ★ Guarda multi-tenant: un moderador solo escanea subredes
//    (segmento_lan / lan_subnets) de SUS propios nodos. Admin sin
//    restricción.
//
//  ★ Opción C (multi-VRF desde el VPS): si el workspace tiene una
//    scan-IP asignada (workspace_scan_ip), se monta en el MikroTik una
//    mangle src=scan-IP → VRF del nodo y el escaneo se ata a esa IP
//    (localAddress). Así N moderadores escanean VRFs distintos en
//    paralelo aunque las LAN se solapen. Sin scan-IP → escaneo legacy
//    (sin localAddress), útil en desarrollo local.
// ============================================================

const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');

const { CIDR_REGEX, getSubnetHosts } = require('../../ubiquiti.service');
const { getDb } = require('../../db.service');
const scanIpRepo = require('../../db/repos/scanIpRepo');
const sessionRepo = require('../../db/repos/sessionRepo');
const scanMangle = require('../../lib/scanMangle');
const scanLock = require('../../lib/scanLock');
const wgDetect = require('../../lib/wgDetect');
const { resolveScanTargetVrf } = require('../../lib/scanTarget');
const log = require('../../lib/logger').child({ scope: 'scan' });

// El SSE se mantiene ABIERTO tras 'complete' mientras el cliente corre la fase de
// auth SSH, para que la scan-mangle siga viva (las antenas solo-SSH necesitan esa
// fase para que el SSH enrute al VRF). El teardown ocurre al cerrar el cliente la
// conexión (fin de la auth) o, como respaldo, tras este margen de seguridad.
const AUTH_GRACE_MS = parseInt(process.env.SCAN_AUTH_GRACE_MS || '300000', 10); // 5 min
// Espera MÁXIMA por el scan-lock antes de responder 409. Acotada para NO bloquear
// hasta el 504 de nginx (~60s) cuando el lock está ocupado por otro escaneo/Monitor AP.
const SCAN_LOCK_WAIT_MS = parseInt(process.env.SCAN_LOCK_WAIT_MS || '8000', 10);

// Registro de escaneos EN CURSO por workspace → función para abortarlos. Permite
// la PREEMPCIÓN: si el moderador vuelve a pulsar "Escanear" mientras un escaneo
// anterior sigue vivo (típicamente colgado en su ventana de gracia de auth, que
// retiene el scan-lock 5 min), el nuevo aborta al anterior y toma el relevo en
// vez de rebotar con 409. Como hay 1 moderador por workspace, el último "Escanear"
// siempre gana. En memoria (por proceso) — suficiente: el lock también lo es.
const inflightScans = new Map(); // workspaceId -> () => void

router.post('/node/scan-stream', async (req, res) => {
  const { nodeLan } = req.body;
  if (!nodeLan || !CIDR_REGEX.test(nodeLan) || parseInt(nodeLan.split('/')[1], 10) < 16) {
    return res.status(400).json({ success: false, message: 'CIDR inválido o muy grande' });
  }

  // Aislamiento + resolución del VRF a escanear. Un moderador solo puede escanear
  // subredes de SUS nodos. Con LANs solapadas entre nodos, se PREFIERE el VRF del
  // túnel activo del usuario (no el "primer nodo con la subred") → el escaneo
  // apunta al túnel que el moderador realmente tiene abierto. Admin → escaneo legacy.
  const acc = req.account;
  let targetVrf = null;
  if (acc && !acc.platform_admin) {
    let resolved;
    try {
      const db = await getDb();
      resolved = await resolveScanTargetVrf({
        db, sessionRepo, workspaceId: acc.workspace_id, userId: acc.sub, nodeLan,
      });
    } catch (_) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    if (!resolved.owns) {
      return res.status(403).json({ success: false, message: 'La subred no pertenece a ninguno de tus túneles' });
    }
    targetVrf = resolved.vrf;
  }

  // ── Opción C: montar la mangle de escaneo si el workspace tiene scan-IP ──
  let localAddress = null;
  let scanMangleUp = false;
  let releaseLock = null;
  // Se setea si el cliente cierra la conexión MIENTRAS esperamos el lock. Lo
  // registramos ANTES del acquire para no filtrar el lock si la petición muere
  // en la espera (causa raíz del 504 que obligaba a reiniciar el backend): el
  // handler de cierre "principal" (req.on('close')) se registra más abajo, tras
  // abrir el SSE, así que sin esto un abort durante el acquire dejaba el lock
  // tomado hasta el timer de seguridad (minutos) → reintentos apilados.
  let clientGone = false;
  if (acc && !acc.platform_admin && targetVrf && req.mikrotik) {
    const scanIp = await scanIpRepo.resolveForWorkspace(acc.workspace_id).catch(() => null);
    if (scanIp) {
      // ── Alerta SOLO en modo local: la scan-IP debe ser una IP WG VIVA en este
      // equipo. Si no lo es (WG reconectó con otra IP, o el admin la tipeó mal),
      // el bind() del probe falla en silencio → 0 resultados (síntoma confuso).
      // Avisamos claro en vez de escanear a ciegas. NO tocamos la config.
      const scanMode = await scanIpRepo.getSetting('scan_mode').catch(() => 'vps');
      if (scanMode === 'local' && !wgDetect.isLocalIpv4(scanIp)) {
        const cands = wgDetect.listLocalMgmtIps().map((c) => c.ip);
        return res.status(409).json({
          success: false,
          code: 'LOCAL_SCAN_IP_STALE',
          message:
            `La IP de escaneo local configurada (${scanIp}) no está activa en este equipo. ` +
            `El administrador debe actualizarla en Ajustes → Modo de escaneo` +
            (cands.length ? ` — IP WG detectada: ${cands.join(', ')}.` : '.'),
        });
      }

      // Serializa contra el job de Monitor AP del mismo workspace (misma scan-IP).
      // El timeout de seguridad del lock se dimensiona al tamaño del escaneo:
      // un /16 puede tardar bastante; con un timeout fijo de 5 min el lock se
      // auto-liberaría a mitad y el job podría conmutar la mangle a otro VRF
      // (resultados del VRF equivocado). ~60ms/host, mín 5 min, máx 30 min.
      const prefix = parseInt(nodeLan.split('/')[1], 10);
      const estHosts = Math.max(1, (2 ** (32 - prefix)) - 2);
      // El lock debe cubrir descubrimiento + fase de auth (SSE abierto) para que
      // el job de Monitor AP no conmute la mangle a otro VRF a mitad de la auth.
      const lockMs = Math.min(30 * 60 * 1000, Math.max(AUTH_GRACE_MS + 120000, estHosts * 60));

      // PREEMPCIÓN: aborta cualquier escaneo anterior del MISMO workspace antes de
      // pedir el lock. Su cleanup libera el lock (tras el teardown), así el nuevo
      // escaneo lo consigue dentro de la espera acotada en vez de chocar con 409.
      const prevAbort = inflightScans.get(acc.workspace_id);
      if (prevAbort) {
        inflightScans.delete(acc.workspace_id);
        log.info({ ws: acc.workspace_id }, 'preempción: abortando escaneo anterior del workspace');
        prevAbort();
      }

      // Si el cliente se va mientras esperamos el lock, NO lo retenemos.
      req.once('close', () => { clientGone = true; });

      // Espera ACOTADA: si el lock sigue ocupado tras SCAN_LOCK_WAIT_MS (otro
      // escaneo o el Monitor AP), respondemos 409 accionable en vez de encolar
      // y dejar que nginx corte con 504 (que apilaba holders → atasco).
      releaseLock = await scanLock.acquireOrNull(acc.workspace_id, SCAN_LOCK_WAIT_MS, lockMs);
      if (!releaseLock) {
        return res.status(409).json({
          success: false,
          code: 'SCAN_BUSY',
          message: 'Hay un escaneo o monitoreo en curso para tu equipo. Reintenta en unos segundos.',
        });
      }
      // Si la petición ya murió durante la espera, soltamos y salimos (sin esto,
      // el lock quedaría tomado hasta el timer de seguridad).
      if (clientGone) { releaseLock(); releaseLock = null; return; }

      try {
        await scanMangle.setup({ workspaceId: acc.workspace_id, scanIp, vrfName: targetVrf, mikrotik: req.mikrotik });
        localAddress = scanIp;
        scanMangleUp = true;
      } catch (e) {
        releaseLock(); releaseLock = null;
        log.warn({ ws: acc.workspace_id, vrf: targetVrf, err: e?.message }, 'no se pudo montar la scan mangle');
        return res.status(503).json({ success: false, message: `No se pudo preparar el escaneo en el router: ${e.message}` });
      }
    }
    // Sin scan-IP asignada → escaneo legacy (sin localAddress).
  }

  // SSE-like streaming over fetch
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const hostIPs = getSubnetHosts(nodeLan);
  const totalCount = hostIPs.length;

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Limpieza idempotente: borra la scan mangle y libera el lock DESPUÉS de que
  // el teardown termine (para no soltar el workspace mientras el router aún
  // tiene la regla → evita carrera con el job de Monitor AP).
  let completed = false;
  let safetyTimer = null;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    // Nos damos de baja del registro de preempción (solo si seguimos siendo el
    // escaneo vigente del workspace; uno posterior pudo habernos reemplazado).
    if (acc?.workspace_id && inflightScans.get(acc.workspace_id) === abortThisScan) {
      inflightScans.delete(acc.workspace_id);
    }
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    if (scanMangleUp) {
      scanMangle.teardown({ workspaceId: acc.workspace_id, mikrotik: req.mikrotik })
        .finally(() => { if (releaseLock) { releaseLock(); releaseLock = null; } });
    } else if (releaseLock) {
      releaseLock(); releaseLock = null;
    }
  };

  sendEvent('start', { total: totalCount });

  // Instanciar el hilo (Worker). El worker vive en server/scanner.worker.js;
  // como este archivo está dos niveles más arriba (routes/nodes/), retrocedemos dos veces.
  const worker = new Worker(path.resolve(__dirname, '..', '..', 'scanner.worker.js'), {
    workerData: { hostIPs, BATCH: 40, localAddress },
  });

  // Cómo abortar ESTE escaneo (por preempción de uno nuevo o por cierre del
  // cliente): aborta el worker, cierra el SSE y limpia (teardown + libera lock).
  // Idempotente vía `cleaned`.
  const abortThisScan = () => {
    try { worker.postMessage({ type: 'abort' }); } catch (_) { /* noop */ }
    // Margen para cerrar antes de forzar la terminación (que puede crashear por ssh2).
    setTimeout(() => { try { worker.terminate(); } catch (_) { /* noop */ } }, 5000);
    try { res.end(); } catch (_) { /* noop */ }
    cleanup();
  };
  // Registramos este escaneo para que uno posterior del mismo workspace lo preempte
  // (solo Opción C: es el que retiene el lock que queremos poder liberar).
  if (acc?.workspace_id && scanMangleUp) inflightScans.set(acc.workspace_id, abortThisScan);

  worker.on('message', (msg) => {
    if (msg.type === 'progress') {
      sendEvent('progress', msg.data);
    } else if (msg.type === 'complete') {
      sendEvent('complete', msg.data);
      completed = true;
      // NO cerramos ni desmontamos aquí: el cliente mantiene el SSE abierto y
      // corre la fase de auth SSH con la scan-mangle aún viva. El teardown se
      // dispara al cerrar el cliente (req 'close') o por el timer de seguridad.
      safetyTimer = setTimeout(() => { try { res.end(); } catch (_) { /* noop */ } cleanup(); }, AUTH_GRACE_MS);
    } else if (msg.type === 'error') {
      sendEvent('error', msg.data);
      res.end();
      cleanup();
    }
  });

  worker.on('error', (error) => {
    sendEvent('error', { message: error.message });
    res.end();
    cleanup();
  });

  worker.on('exit', (code) => {
    if (code !== 0 && code !== 1 && !completed) {
      sendEvent('error', { message: `Worker finalizó con código ${code}` });
      try { res.end(); } catch (_) { /* noop */ }
    }
    // Tras 'complete' (salida normal del worker) NO limpiamos: la mangle sigue
    // viva para la fase de auth; el cliente disparará el teardown al cerrar.
    if (!completed) cleanup();
  });

  // Abortar el hilo gracefully si el cliente cierra la conexión HTTP.
  req.on('close', abortThisScan);
});

module.exports = router;
