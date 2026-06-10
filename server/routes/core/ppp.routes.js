// ============================================================
//  routes/core/ppp.routes.js — PPP secrets y sesiones activas
//
//   POST /secrets  → /ppp/secret/print  (backend mapea .id → id)
//   POST /active   → /ppp/active/print  (sesiones PPP corriendo)
// ============================================================

const express = require('express');
const router = express.Router();

const { connectToMikrotik, safeWrite } = require('../../routeros.service');

router.post('/secrets', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const secrets = await safeWrite(api, ['/ppp/secret/print']);
    await api.close();
    res.json(secrets.map(item => ({
      id: item['.id'],
      name: item.name || 'Unknown',
      service: item.service || 'any',
      profile: item.profile || 'default',
      disabled: item.disabled === 'true' || item.disabled === true,
      running: false,
    })));
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { }
    res.status(500).json({ success: false, message: error.message || 'Error al obtener secretos del MikroTik' });
  }
});

router.post('/active', async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const activeConnections = await safeWrite(api, ['/ppp/active/print']);
    await api.close();
    res.json(activeConnections.map(item => ({
      name: item.name || 'Unknown',
      service: item.service || 'any',
      address: item.address || '',
      uptime: item.uptime || '',
    })));
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { }
    res.status(500).json({ success: false, message: error.message || 'Error al obtener conexiones activas' });
  }
});

module.exports = router;
