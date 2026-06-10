// ============================================================
//  routes/core/connection.routes.js — pruebas de conectividad
//
//   POST /connect    → login RouterOS API + /system/resource/print
//   POST /diagnose   → TCP probe :8728/:8729 + login test
// ============================================================

const express = require('express');
const net = require('net');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'core:connection' });
const { connectToMikrotik, safeWrite, getErrorMessage } = require('../../routeros.service');

router.post('/connect', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  if (!ip || !user) return res.status(400).json({ success: false, message: 'Faltan credenciales' });
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const resource = await safeWrite(api, ['/system/resource/print']);
    await api.close();
    res.json({ success: true, message: 'Conectado exitosamente', data: resource });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { }
    const msg = getErrorMessage(error, ip, user);
    log.error({ ip, user, errno: error?.errno, code: error?.code, err: error?.message }, 'CONNECT fallo');
    res.status(500).json({ success: false, message: msg });
  }
});

router.post('/diagnose', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  if (!ip) return res.status(400).json({ success: false });
  const steps = [];
  const probe = (port) => new Promise((resolve) => {
    const s = net.createConnection({ host: ip, port, timeout: 5000 });
    s.once('connect', () => { s.destroy(); resolve({ port, open: true }); });
    s.once('timeout', () => { s.destroy(); resolve({ port, open: false, reason: 'timeout' }); });
    s.once('error',   (e) => { resolve({ port, open: false, reason: e.code || e.message }); });
  });
  const [r8728, r8729] = await Promise.all([probe(8728), probe(8729)]);
  steps.push(r8728);
  steps.push(r8729);
  let authOk = false, authMsg = '';
  if ((r8728.open || r8729.open) && user) {
    let api;
    try {
      api = await connectToMikrotik(ip, user, pass);
      await api.close();
      authOk = true; authMsg = 'Credenciales correctas';
    } catch (e) {
      authMsg = getErrorMessage(e, ip, user);
    }
  }
  res.json({ steps, authOk, authMsg, apiReachable: r8728.open || r8729.open });
});

module.exports = router;
