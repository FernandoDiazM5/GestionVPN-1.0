// ============================================================
//  nodeDeprovision.js — limpieza en el ROUTER de toda la infra de UN nodo.
//  Fuente de verdad única usada por:
//    • POST /node/deprovision         (borrado de un nodo por el moderador)
//    • DELETE /admin/moderators/:id    (cascada al eliminar un moderador)
//
//  Limpia: mangle + peer/secret + IP + interfaz (WG/SSTP) + interface-lists
//  (LIST-VPN-TOWERS/WG/SSTP) + rutas del VRF + VRF.
//
//  ⚠️ NO toca el address-list LIST-NET-REMOTE-TOWERS: varias torres comparten
//     la misma LAN (por eso el aislamiento es por VRF+mangle); borrar la entrada
//     rompería a los nodos hermanos. Queda inerte sin ruta/VRF.
//  ⚠️ NO toca la BD (el caller decide cómo borrar las filas).
//  Best-effort: cada remove se loguea si falla y se continúa.
// ============================================================
const { connectToMikrotik, safeWrite } = require('../routeros.service');
const log = require('./logger').child({ scope: 'node-deprovision' });

/**
 * @param {{ip:string,user:string,pass:string}} creds
 * @param {{pppUser:string, vrfName?:string, protocol?:string}} node
 * @returns {Promise<{steps:Array<object>}>}
 */
async function deprovisionNodeOnRouter(creds, { pppUser, vrfName, protocol }) {
  const { ip, user, pass } = creds;
  const isWireGuard = protocol === 'wireguard' || pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');
  const hasVrf = !!vrfName;
  // WG: ifaceName === pppUser ("WG-ND4-..."). SSTP: derivado del VRF.
  const ifaceName = isWireGuard ? pppUser : (hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '');

  const steps = [];
  const pushStep = (s) => { steps[steps.length] = s; };
  let api;
  try {
    // ── CONEXIÓN 1: leer TODO secuencialmente (RouterOS es secuencial) ──
    const apiRead = await connectToMikrotik(ip, user, pass);
    const safeRead = (cmd) =>
      safeWrite(apiRead, [cmd], 6000).catch(e => { log.warn({ cmd, err: e?.message }, 'DEPROVISION read falló'); return []; });

    const mangle     = await safeRead('/ip/firewall/mangle/print');
    const members    = await safeRead('/interface/list/member/print');
    const secrets    = !isWireGuard ? await safeRead('/ppp/secret/print')                : [];
    const sstpIfaces = !isWireGuard ? await safeRead('/interface/sstp-server/print')     : [];
    const actives    = !isWireGuard ? await safeRead('/ppp/active/print')                : [];
    const wgPeers    =  isWireGuard ? await safeRead('/interface/wireguard/peers/print') : [];
    const wgIfaces   =  isWireGuard ? await safeRead('/interface/wireguard/print')       : [];
    const addrs      =  isWireGuard ? await safeRead('/ip/address/print')                : [];
    const vrfs       = hasVrf       ? await safeRead('/ip/vrf/print')                    : [];
    const routes     = hasVrf       ? await safeRead('/ip/route/print')                  : [];
    await apiRead.close().catch(() => {});

    // ── CONEXIÓN 2: removes en conexión limpia ──
    api = await connectToMikrotik(ip, user, pass);
    const silentRemove = (cmd, id) =>
      safeWrite(api, [cmd, `=.id=${id}`], 10000).catch(e => log.warn({ cmd, id, err: e?.message }, 'DEPROVISION ignorado'));

    // Paso 1: Mangle (new-routing-mark === vrfName)
    if (hasVrf) {
      const mangleMatch = mangle.filter(m => m['new-routing-mark'] === vrfName && m['.id']);
      for (const m of mangleMatch) await silentRemove('/ip/firewall/mangle/remove', m['.id']);
      pushStep({ step: 1, obj: 'Reglas Mangle', name: `${mangleMatch.length} eliminadas`, status: 'ok' });
    }

    if (isWireGuard) {
      // Paso 2: Peers WG (interface === ifaceName)
      const peersToRemove = wgPeers.filter(p => p.interface === ifaceName && p['.id']);
      for (const p of peersToRemove) await silentRemove('/interface/wireguard/peers/remove', p['.id']);
      pushStep({ step: 2, obj: 'WG Peers', name: `${peersToRemove.length} peer(s)`, status: 'ok' });

      // Paso 3: IP address de la interface WG
      const wgAddrs = addrs.filter(a => a.interface === ifaceName && a['.id']);
      for (const a of wgAddrs) await silentRemove('/ip/address/remove', a['.id']);
      pushStep({ step: 3, obj: 'WG IP Address', name: `${wgAddrs.length} IP(s)`, status: 'ok' });

      // Paso 4: Interface WireGuard
      const wgIface = wgIfaces.find(i => i.name === ifaceName);
      if (wgIface) await silentRemove('/interface/wireguard/remove', wgIface['.id']);
      pushStep({ step: 4, obj: 'WG Interface', name: ifaceName, status: 'ok' });

      if (hasVrf) {
        // Paso 5: Interface Lists — LIST-VPN-TOWERS + LIST-VPN-WG
        let membersRemoved = 0;
        for (const list of ['LIST-VPN-TOWERS', 'LIST-VPN-WG']) {
          const entry = members.find(m => m.interface === ifaceName && m.list === list);
          if (entry) { await silentRemove('/interface/list/member/remove', entry['.id']); membersRemoved++; }
        }
        pushStep({ step: 5, obj: 'Interface Lists (TOWERS + WG)', name: `${membersRemoved} entradas`, status: 'ok' });
      }
    } else {
      // Paso 2: Desconectar sesión PPP activa (si no, RouterOS rechaza el remove del secret)
      const activeSession = actives.find(a => a.name === pppUser);
      if (activeSession) await silentRemove('/ppp/active/remove', activeSession['.id']);
      pushStep({ step: 2, obj: 'Sesión PPP Activa', name: activeSession ? `desconectada (${pppUser})` : 'sin sesión activa', status: 'ok' });

      // Paso 3: PPP Secret
      const secret = secrets.find(s => s.name === pppUser);
      if (secret) await silentRemove('/ppp/secret/remove', secret['.id']);
      pushStep({ step: 3, obj: 'PPP Secret', name: pppUser, status: 'ok' });

      if (hasVrf) {
        // Paso 4: SSTP Interface — por user (robusto), fallback por name
        const iface = sstpIfaces.find(i => i.user === pppUser) || sstpIfaces.find(i => i.name === ifaceName);
        if (iface) await silentRemove('/interface/sstp-server/remove', iface['.id']);
        pushStep({ step: 4, obj: 'SSTP Interface', name: ifaceName, status: 'ok' });

        // Paso 5: Interface Lists — LIST-VPN-TOWERS + LIST-VPN-SSTP
        let membersRemoved = 0;
        for (const list of ['LIST-VPN-TOWERS', 'LIST-VPN-SSTP']) {
          const entry = members.find(m => m.interface === ifaceName && m.list === list);
          if (entry) { await silentRemove('/interface/list/member/remove', entry['.id']); membersRemoved++; }
        }
        pushStep({ step: 5, obj: 'Interface Lists (TOWERS + SSTP)', name: `${membersRemoved} entradas`, status: 'ok' });
      }
    }

    if (hasVrf) {
      // Paso 6: Rutas — todas las de esta routing-table (ida LAN + vuelta MGMT). 1 VRF por nodo.
      const vrfRoutes = routes.filter(r => r['routing-table'] === vrfName && r.dynamic !== 'true' && r['.id']);
      for (const r of vrfRoutes) await silentRemove('/ip/route/remove', r['.id']);
      pushStep({ step: 6, obj: 'Rutas VRF (ida + vuelta)', name: `${vrfRoutes.length} rutas eliminadas`, status: 'ok' });

      // Paso 7: VRF
      const vrf = vrfs.find(v => v.name === vrfName);
      if (vrf) await silentRemove('/ip/vrf/remove', vrf['.id']);
      pushStep({ step: 7, obj: 'VRF', name: vrf ? `${vrfName} eliminado` : 'no encontrado (ya eliminado)', status: 'ok' });
    }

    await api.close();
    return { steps };
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    throw error;
  }
}

module.exports = { deprovisionNodeOnRouter };
