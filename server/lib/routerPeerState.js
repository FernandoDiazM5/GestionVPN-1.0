// ============================================================
//  Estado habilitado/deshabilitado de peers WireGuard en MikroTik
//  Sirve para suspender (sin eliminar) el acceso de un usuario:
//  el peer queda en el router con =disabled=yes; al rehabilitar
//  vuelve a funcionar con las mismas credenciales del cliente.
//
//  Best-effort: si el router está caído NO bloquea el flujo de
//  habilitar/deshabilitar en BD (se reintenta luego).
// ============================================================
const { connectToMikrotik, safeWrite } = require('../routeros.service');
const { getAppSetting, decryptPass } = require('../db.service');
const { findUserMangleIds, removeMangleIds } = require('./tunnelProvisioner');

async function getMikrotikCreds() {
  const ip = await getAppSetting('MT_IP');
  const user = await getAppSetting('MT_USER');
  const passData = await getAppSetting('MT_PASS');
  if (!ip || !user || !passData) return null;
  return { ip, user, pass: decryptPass(passData) };
}

/**
 * Aplica `=disabled=yes|no` a un conjunto de peers WG por public-key.
 * @param {string[]} publicKeys
 * @param {boolean} enabled  true → habilitar (=disabled=no), false → deshabilitar
 * @returns {Promise<{updated:number, notFound:number, failed:number, skipped:boolean}>}
 */
async function setPeersEnabled(publicKeys, enabled) {
  const keys = (publicKeys || []).filter(Boolean);
  if (!keys.length) return { updated: 0, notFound: 0, failed: 0, skipped: true };
  const mt = await getMikrotikCreds();
  if (!mt) {
    console.warn('[router-peer-state] Router no configurado, peers no sincronizados:', keys.length);
    return { updated: 0, notFound: 0, failed: 0, skipped: true };
  }

  let api;
  let updated = 0, notFound = 0, failed = 0;
  try {
    api = await connectToMikrotik(mt.ip, mt.user, mt.pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
    const keySet = new Set(keys);
    const targets = peers.filter(p => p.interface === 'VPN-WG-MGMT' && keySet.has(p['public-key']));
    const foundKeys = new Set(targets.map(p => p['public-key']));
    notFound = keys.filter(k => !foundKeys.has(k)).length;

    for (const peer of targets) {
      try {
        await safeWrite(api, ['/interface/wireguard/peers/set',
          `=.id=${peer['.id']}`,
          `=disabled=${enabled ? 'no' : 'yes'}`]);
        updated++;
      } catch (e) {
        failed++;
        console.warn('[router-peer-state] No se pudo actualizar peer', peer['.id'], e.message);
      }
    }
    await api.close();
  } catch (e) {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
    console.warn('[router-peer-state] Router inalcanzable:', e.message);
    return { updated, notFound, failed: keys.length - updated, skipped: true };
  }

  return { updated, notFound, failed, skipped: false };
}

/** Variante de un solo peer. */
async function setPeerEnabled(publicKey, enabled) {
  return setPeersEnabled([publicKey], enabled);
}

/**
 * Elimina TODAS las reglas mangle activas de los user_ids indicados (matcheando
 * por el comment `ACCESO-USER-<userTag>` que crea el provisioner). Se usa al
 * deshabilitar/eliminar usuarios para cortar el acceso al instante sin esperar
 * el TTL natural de la sesión.
 *
 * @param {string[]} userIds
 * @returns {Promise<{removed:number, failed:number, skipped:boolean}>}
 */
async function removeUserMangles(userIds) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) return { removed: 0, failed: 0, skipped: true };
  const mt = await getMikrotikCreds();
  if (!mt) {
    console.warn('[router-peer-state] Router no configurado, mangles no eliminados:', ids.length);
    return { removed: 0, failed: 0, skipped: true };
  }

  let api;
  let removed = 0, failed = 0;
  try {
    api = await connectToMikrotik(mt.ip, mt.user, mt.pass);
    // Para cada user: encontrar sus .id de mangle y borrarlos. Si findUserMangleIds
    // falla, lo loggeamos y continuamos con el siguiente (best-effort).
    for (const userId of ids) {
      try {
        const mangleIds = await findUserMangleIds(api, userId);
        if (!mangleIds.length) continue;
        await removeMangleIds(api, mangleIds);
        removed += mangleIds.length;
      } catch (e) {
        failed++;
        console.warn(`[router-peer-state] mangle cleanup user=${userId} falló:`, e.message);
      }
    }
    await api.close();
  } catch (e) {
    if (api) try { await api.close(); } catch (_) { /* noop */ }
    console.warn('[router-peer-state] Router inalcanzable (mangle cleanup):', e.message);
    return { removed, failed: ids.length - removed, skipped: true };
  }

  return { removed, failed, skipped: false };
}

module.exports = { setPeerEnabled, setPeersEnabled, removeUserMangles };
