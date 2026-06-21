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
const mgmtNet = require('./mgmtNet');
const log = require('./logger').child({ scope: 'router-cleanup' });

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
    log.warn({ count: keys.length }, 'Router no configurado, peers no eliminados');
    return { removed: 0, failed: 0, skipped: true };
  }
  let api;
  let removed = 0, failed = 0;
  try {
    api = await connectToMikrotik(mt.ip, mt.user, mt.pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
    const keySet = new Set(keys);
    // Interfaces de gestión de usuario del plano 10.x (CLIENTES + ADMIN). Antes
    // estaba hardcodeado 'VPN-WG-MGMT' (plano viejo) → no encontraba los peers y
    // NO borraba nada al eliminar un moderador/member.
    const targets = peers.filter(p => mgmtNet.userIfaces.includes(p.interface) && keySet.has(p['public-key']));
    for (const peer of targets) {
      try {
        await safeWrite(api, ['/interface/wireguard/peers/remove', `=.id=${peer['.id']}`]);
        removed++;
      } catch (e) {
        failed++;
        log.warn({ peerId: peer['.id'], err: e.message }, 'No se pudo remover peer');
      }
    }
    await api.close();
  } catch (e) {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
    log.warn({ err: e.message }, 'Router inalcanzable');
    return { removed, failed: keys.length - removed, skipped: true };
  }
  return { removed, failed, skipped: false };
}

module.exports = { removePeersFromRouter };
