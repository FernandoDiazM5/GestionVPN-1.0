// ============================================================
//  routes/nodes/scan.routes.js — escaneo SSE de subred remota
//
//   POST /node/scan-stream  → SSE con Worker thread
//
//  ★ Guarda multi-tenant: un moderador solo escanea subredes
//    (segmento_lan / lan_subnets) de SUS propios nodos. Admin sin
//    restricción.
// ============================================================

const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');

const { CIDR_REGEX, getSubnetHosts } = require('../../ubiquiti.service');
const { getDb } = require('../../db.service');

router.post('/node/scan-stream', async (req, res) => {
  const { nodeLan } = req.body;
  if (!nodeLan || !CIDR_REGEX.test(nodeLan) || parseInt(nodeLan.split('/')[1], 10) < 16) {
    return res.status(400).json({ success: false, message: 'CIDR inválido o muy grande' });
  }

  // Aislamiento: el escaneo deriva de un túnel. Un moderador solo puede
  // escanear subredes (segmento_lan / lan_subnets) de SUS propios nodos.
  // El Administrador de plataforma no tiene restricción.
  const acc = req.account;
  if (acc && !acc.platform_admin) {
    try {
      const db = await getDb();
      const rows = await db.all('SELECT segmento_lan, lan_subnets FROM nodes WHERE workspace_id = ?', [acc.workspace_id]);
      const owned = new Set();
      rows.forEach(r => {
        if (r.segmento_lan) owned.add(String(r.segmento_lan).trim());
        try { (JSON.parse(r.lan_subnets || '[]') || []).forEach(s => owned.add(String(s).trim())); } catch (_) { /* noop */ }
      });
      if (!owned.has(String(nodeLan).trim())) {
        return res.status(403).json({ success: false, message: 'La subred no pertenece a ninguno de tus túneles' });
      }
    } catch (_) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
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

  sendEvent('start', { total: totalCount });

  // Instanciar el hilo (Worker). El worker vive en server/scanner.worker.js;
  // como este archivo está dos niveles más arriba (routes/nodes/), retrocedemos dos veces.
  const worker = new Worker(path.resolve(__dirname, '..', '..', 'scanner.worker.js'), {
    workerData: { hostIPs, BATCH: 40 },
  });

  worker.on('message', (msg) => {
    if (msg.type === 'progress') {
      sendEvent('progress', msg.data);
    } else if (msg.type === 'complete') {
      sendEvent('complete', msg.data);
      res.end();
    } else if (msg.type === 'error') {
      sendEvent('error', msg.data);
      res.end();
    }
  });

  worker.on('error', (error) => {
    sendEvent('error', { message: error.message });
    res.end();
  });

  worker.on('exit', (code) => {
    if (code !== 0 && code !== 1) {
      sendEvent('error', { message: `Worker finalizó con código ${code}` });
      res.end();
    }
  });

  // Abortar hilo gracefully si el cliente cierra la conexión HTTP
  req.on('close', () => {
    worker.postMessage({ type: 'abort' });
    // Darle un margen para cerrar antes de forzar su terminación (que puede crashear por ssh2)
    setTimeout(() => {
      try { worker.terminate(); } catch (_) { /* noop */ }
    }, 5000);
  });
});

module.exports = router;
