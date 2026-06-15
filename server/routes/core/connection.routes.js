// ============================================================
//  routes/core/connection.routes.js — pruebas de conectividad
//
//   POST /connect    → login RouterOS API + /system/resource/print
//   POST /diagnose   → TCP probe :8728/:8729 + login test
//
//  Fase F5.A: shape uniforme (sendOk/AppError) + Zod.
// ============================================================
const express = require('express');
const net = require('net');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'core:connection' });
const { connectToMikrotik, safeWrite, getErrorMessage } = require('../../routeros.service');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { requireMikrotik } = require('../../lib/routeGuards');

router.post('/connect', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  if (!ip || !user) throw new AppError('Faltan credenciales', 400, 'BAD_REQUEST');
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const resource = await safeWrite(api, ['/system/resource/print']);
    await api.close();
    return sendOk(res, { message: 'Conectado exitosamente', data: resource });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    log.error({ ip, user, errno: error?.errno, code: error?.code, err: error?.message }, 'CONNECT fallo');
    throw new AppError(getErrorMessage(error, ip, user), 500, 'MIKROTIK_ERROR');
  }
}));

router.post('/diagnose', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  if (!ip) throw new AppError('Falta IP', 400, 'BAD_REQUEST');

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
  // Endpoint /diagnose históricamente NO envuelve en { success } — devuelve el
  // objeto plano. Mantengo el shape para no romper la UI que lo lee directo.
  return res.json({ steps, authOk, authMsg, apiReachable: r8728.open || r8729.open });
}));

module.exports = router;
