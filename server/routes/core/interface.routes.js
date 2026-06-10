// ============================================================
//  routes/core/interface.routes.js — habilita/deshabilita binding
//
//   POST /interface/activate    → enable existing SSTP/WG-server binding
//                                  (lo crea si falta)
//   POST /interface/deactivate  → disable binding (sin borrarlo)
// ============================================================

const express = require('express');
const router = express.Router();

const { connectToMikrotik, safeWrite } = require('../../routeros.service');

router.post('/interface/activate', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  const { vpnName, vpnService } = req.body;
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
    res.json({ success: true, ip: allActive.find(s => s.name === vpnName)?.address });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { }
    res.status(500).json({ success: false, message: error.message || 'Error activando interface' });
  }
});

router.post('/interface/deactivate', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  const { vpnName, vpnService } = req.body;
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const bindingMenu = `/interface/${vpnService}-server`;
    const allIfaces = await safeWrite(api, [`${bindingMenu}/print`]);
    const existingIface = allIfaces.find(i => i.user === vpnName);
    if (existingIface?.['.id']) await safeWrite(api, [`${bindingMenu}/disable`, `=.id=${existingIface['.id']}`]);
    await api.close();
    res.json({ success: true });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { }
    res.status(500).json({ success: false, message: error.message || 'Error desactivando interface' });
  }
});

module.exports = router;
