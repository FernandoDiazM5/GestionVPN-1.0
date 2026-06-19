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
const scanMangle = require('../../lib/scanMangle');
const scanLock = require('../../lib/scanLock');
const log = require('../../lib/logger').child({ scope: 'scan' });

// El SSE se mantiene ABIERTO tras 'complete' mientras el cliente corre la fase de
// auth SSH, para que la scan-mangle siga viva (las antenas solo-SSH necesitan esa
// fase para que el SSH enrute al VRF). El teardown ocurre al cerrar el cliente la
// conexión (fin de la auth) o, como respaldo, tras este margen de seguridad.
const AUTH_GRACE_MS = parseInt(process.env.SCAN_AUTH_GRACE_MS || '300000', 10); // 5 min

router.post('/node/scan-stream', async (req, res) => {
  const { nodeLan } = req.body;
  if (!nodeLan || !CIDR_REGEX.test(nodeLan) || parseInt(nodeLan.split('/')[1], 10) < 16) {
    return res.status(400).json({ success: false, message: 'CIDR inválido o muy grande' });
  }

  // Aislamiento + resolución del VRF dueño de la subred. Un moderador solo
  // puede escanear subredes de SUS nodos. El platform_admin no tiene workspace
  // ni scan-IP → escaneo legacy.
  const acc = req.account;
  let targetVrf = null;
  if (acc && !acc.platform_admin) {
    try {
      const db = await getDb();
      const rows = await db.all('SELECT nombre_vrf, segmento_lan, lan_subnets FROM nodes WHERE workspace_id = ?', [acc.workspace_id]);
      let owns = false;
      for (const r of rows) {
        const subs = new Set();
        if (r.segmento_lan) subs.add(String(r.segmento_lan).trim());
        try { (JSON.parse(r.lan_subnets || '[]') || []).forEach(s => subs.add(String(s).trim())); } catch (_) { /* noop */ }
        if (subs.has(String(nodeLan).trim())) {
          owns = true;
          // Primer match: si la misma LAN está en varios nodos del workspace,
          // la scan-IP única solo puede apuntar a un VRF (limitación documentada).
          if (!targetVrf) targetVrf = r.nombre_vrf || null;
          break;
        }
      }
      if (!owns) {
        return res.status(403).json({ success: false, message: 'La subred no pertenece a ninguno de tus túneles' });
      }
    } catch (_) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
  }

  // ── Opción C: montar la mangle de escaneo si el workspace tiene scan-IP ──
  let localAddress = null;
  let scanMangleUp = false;
  let releaseLock = null;
  if (acc && !acc.platform_admin && targetVrf && req.mikrotik) {
    const scanIp = await scanIpRepo.resolveForWorkspace(acc.workspace_id).catch(() => null);
    if (scanIp) {
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
      releaseLock = await scanLock.acquire(acc.workspace_id, lockMs);
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

  // Abortar hilo gracefully si el cliente cierra la conexión HTTP
  req.on('close', () => {
    worker.postMessage({ type: 'abort' });
    // Darle un margen para cerrar antes de forzar su terminación (que puede crashear por ssh2)
    setTimeout(() => {
      try { worker.terminate(); } catch (_) { /* noop */ }
    }, 5000);
    cleanup();
  });
});

module.exports = router;
