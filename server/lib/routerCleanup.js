// ============================================================
//  Limpieza de peers WireGuard en el MikroTik
//  Usado por DELETE moderator (admin.routes.js) y DELETE member
//  (team.routes.js) para evitar peers huérfanos en el router.
//
//  Best-effort: si el router está caído, NO bloquea el borrado en BD.
//  El operador puede reintentar más tarde desde la UI.
// ============================================================
const { connectToMikrotik, safeWrite } = require('../routeros.service');
const { getAppSetting, decryptPass } = require('../db.service');

async function getMikrotikCreds() {
  const ip = await getAppSetting('MT_IP');
  const user = await getAppSetting('MT_USER');
  const passData = await getAppSetting('MT_PASS');
  if (!ip || !user || !passData) return null;
  return { ip, user, pass: decryptPass(passData) };
}

/**
 * Elimina peers WG del router por public-key. Best-effort: si el router está
 * caído, NO bloquea el flujo de borrado (los registros de BD se limpian igual).
 *
 * @param {string[]} publicKeys
 * @returns {Promise<{removed:number, failed:number, skipped:boolean}>}
 */
async function removePeersFromRouter(publicKeys) {
  const keys = (publicKeys || []).filter(Boolean);
  if (!keys.length) return { removed: 0, failed: 0, skipped: true };
  const mt = await getMikrotikCreds();
  if (!mt) {
    console.warn('[router-cleanup] Router no configurado, peers no eliminados:', keys.length);
    return { removed: 0, failed: 0, skipped: true };
  }
  let api;
  let removed = 0, failed = 0;
  try {
    api = await connectToMikrotik(mt.ip, mt.user, mt.pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
    const keySet = new Set(keys);
    const targets = peers.filter(p => p.interface === 'VPN-WG-MGMT' && keySet.has(p['public-key']));
    for (const peer of targets) {
      try {
        await safeWrite(api, ['/interface/wireguard/peers/remove', `=.id=${peer['.id']}`]);
        removed++;
      } catch (e) {
        failed++;
        console.warn('[router-cleanup] No se pudo remover peer', peer['.id'], e.message);
      }
    }
    await api.close();
  } catch (e) {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
    console.warn('[router-cleanup] Router inalcanzable:', e.message);
    return { removed, failed: keys.length - removed, skipped: true };
  }
  return { removed, failed, skipped: false };
}

module.exports = { removePeersFromRouter };
