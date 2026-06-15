// ============================================================
//  routes/core/interface.routes.js — habilita/deshabilita binding
//
//   POST /interface/activate    → enable existing SSTP/WG-server binding
//                                  (lo crea si falta)
//   POST /interface/deactivate  → disable binding (sin borrarlo)
//
//  Fase F5.A: shape uniforme (sendOk/AppError) + Zod.
// ============================================================
const express = require('express');
const router = express.Router();

const { connectToMikrotik, safeWrite } = require('../../routeros.service');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { requireMikrotik } = require('../../lib/routeGuards');
const { InterfaceActionRequestSchema } = require('@gestionvpn/contracts');

router.post('/interface/activate', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { vpnName, vpnService } = InterfaceActionRequestSchema.parse(req.body);
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const bindingMenu = `/interface/${vpnService}-server`;
    const allIfaces = await safeWrite(api, [`${bindingMenu}/print`]);
    const existingIface = allIfaces.find(i => i.user === vpnName);
    if (existingIface?.['.id']) {
      if (existingIface.disabled === 'true' || existingIface.disabled === true) {
        await safeWrite(api, [`${bindingMenu}/enable`, `=.id=${existingIface['.id']}`]);
      }
    } else {
      await safeWrite(api, [`${bindingMenu}/add`, `=name=${vpnService}-${vpnName}`, `=user=${vpnName}`]);
    }
    const allActive = await safeWrite(api, ['/ppp/active/print']);
    await api.close();
    return sendOk(res, { ip: allActive.find(s => s.name === vpnName)?.address });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(error.message || 'Error activando interface', 500, 'MIKROTIK_ERROR');
  }
}));

router.post('/interface/deactivate', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { vpnName, vpnService } = InterfaceActionRequestSchema.parse(req.body);
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const bindingMenu = `/interface/${vpnService}-server`;
    const allIfaces = await safeWrite(api, [`${bindingMenu}/print`]);
    const existingIface = allIfaces.find(i => i.user === vpnName);
    if (existingIface?.['.id']) await safeWrite(api, [`${bindingMenu}/disable`, `=.id=${existingIface['.id']}`]);
    await api.close();
    return sendOk(res);
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(error.message || 'Error desactivando interface', 500, 'MIKROTIK_ERROR');
  }
}));

module.exports = router;
