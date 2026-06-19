// ============================================================
//  routes/core/tunnel-repair.routes.js — reconstrucción idempotente
//
//   POST /tunnel/repair → verifica y reconstruye la config completa
//                          de un nodo VPN (7 pasos atómicos).
//
//  Aislado en su propio archivo porque es naturalmente denso (~330 LOC)
//  y mezclar con tunnel.routes.js (multi-usuario) confundiría niveles
//  de abstracción.
// ============================================================

const express = require('express');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'core:tunnel-repair' });
const { connectToMikrotik, safeWrite, getErrorMessage, writeIdempotent } = require('../../routeros.service');
const { getDb } = require('../../db.service');
const provisioner = require('../../lib/tunnelProvisioner');
const sessionRepo = require('../../db/repos/sessionRepo');
const { requireOperator } = require('../nodes/_shared');
const mgmtNet = require('../../lib/mgmtNet');

router.post('/tunnel/repair', requireOperator, async (req, res) => {
  if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
  const { ip, user, pass } = req.mikrotik;
  const { pppUser, vrfName, lanSubnets, adminWgNet } = req.body;

  if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
  if (!vrfName) return res.status(400).json({ success: false, message: 'vrfName requerido' });
  if (!Array.isArray(lanSubnets) || lanSubnets.length === 0)
    return res.status(400).json({ success: false, message: 'lanSubnets debe ser un array no vacío' });

  // Detectar protocolo: WG si empieza con WG-ND (nodos torre) o VPN-WG- (gestión)
  const isWG       = (pppUser || '').startsWith('WG-ND') || (pppUser || '').startsWith('VPN-WG-');
  // ifaceName: para WG === pppUser; para SSTP se deriva del VRF
  const ifaceName  = isWG ? pppUser : vrfName.replace(/^VRF-/, 'VPN-SSTP-');
  // Rutas de retorno del plano de gestión (CLIENTES/ADMIN/VPS). `adminWgNet`
  // del body solo se respeta como override puntual de la primera (compat).
  const mgmtReturnRoutes = mgmtNet.returnRoutes();
  if (adminWgNet) mgmtReturnRoutes[0] = { subnet: adminWgNet, gateway: mgmtNet.clients.iface, tag: 'MGMT-CLIENTES' };
  const steps      = [];
  let   repaired   = 0;

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);

    // ── Leer estado actual en paralelo ──────────────────────────────────────
    const [
      sstpResult,
      wgIfaceResult,
      ifaceListResult,
      vrfResult,
      routesResult,
      addressListResult,
      mangleResult,
      ipAddressResult,
      wgPeersResult,
    ] = await Promise.allSettled([
      safeWrite(api, ['/interface/sstp-server/print']),
      safeWrite(api, ['/interface/wireguard/print']),
      safeWrite(api, ['/interface/list/member/print']),
      safeWrite(api, ['/ip/vrf/print']),
      safeWrite(api, ['/ip/route/print']),
      safeWrite(api, ['/ip/firewall/address-list/print']),
      safeWrite(api, ['/ip/firewall/mangle/print']),
      safeWrite(api, ['/ip/address/print']),
      safeWrite(api, ['/interface/wireguard/peers/print']),
    ]);

    const allSstp     = sstpResult.status        === 'fulfilled' ? sstpResult.value        : [];
    const allWgIfaces = wgIfaceResult.status     === 'fulfilled' ? wgIfaceResult.value     : [];
    const allMembers  = ifaceListResult.status   === 'fulfilled' ? ifaceListResult.value   : [];
    const allVrfs     = vrfResult.status         === 'fulfilled' ? vrfResult.value         : [];
    const allRoutes   = routesResult.status      === 'fulfilled' ? routesResult.value      : [];
    const allAddrs    = addressListResult.status === 'fulfilled' ? addressListResult.value : [];
    const allMangle   = mangleResult.status      === 'fulfilled' ? mangleResult.value      : [];
    const allIpAddrs  = ipAddressResult.status   === 'fulfilled' ? ipAddressResult.value   : [];
    const allWgPeers  = wgPeersResult.status     === 'fulfilled' ? wgPeersResult.value     : [];

    // ── Paso 1: Interface SSTP (o WireGuard) ────────────────────────────────
    try {
      if (isWG) {
        // Para WireGuard: verificar/crear la interface WG
        const existsWg = allWgIfaces.some(i => i.name === ifaceName);
        if (existsWg) {
          steps.push({ step: 1, obj: 'WG Interface', name: ifaceName, status: 'ok', action: 'exists' });
        } else {
          // Calcular puerto WG desde el nombre (VPN-WG-NDx-...)
          const ndMatch = ifaceName.match(/ND(\d+)/i);
          const wgPort = ndMatch ? (13300 + parseInt(ndMatch[1])) : 13301;
          const ndComment = ndMatch ? `ND${ndMatch[1]}` : '';
          await writeIdempotent(api, [
            '/interface/wireguard/add',
            `=name=${ifaceName}`,
            `=listen-port=${wgPort}`,
            `=comment=${ndComment}`,
          ]);
          steps.push({ step: 1, obj: 'WG Interface', name: ifaceName, status: 'created', action: 'created' });
          repaired++;
        }

        // Obtener datos WG desde DB local para restaurar IP y Peers
        const db = await getDb();
        const nodeRowDB = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
        let ipTunnel = '', wgPubKey = '';
        if (nodeRowDB) {
          ipTunnel = nodeRowDB.ip_tunnel || '';
          wgPubKey = nodeRowDB.wg_public_key || nodeRowDB.cpe_public_key || '';
        }

        // Restaurar IP Address WG
        if (ipTunnel) {
          const existsIp = allIpAddrs.some(a => a.interface === ifaceName && a.address.startsWith(ipTunnel.split('/')[0]));
          if (existsIp) {
            steps.push({ step: 1.1, obj: 'WG IP', name: ipTunnel, status: 'ok', action: 'exists' });
          } else {
            const ndMatch = ifaceName.match(/ND(\d+)/i);
            const ndComment = ndMatch ? `ND${ndMatch[1]}` : '';
            await writeIdempotent(api, [
              '/ip/address/add',
              `=address=${ipTunnel}`,
              `=interface=${ifaceName}`,
              `=comment=IP Core a ${ndComment}`,
            ]);
            steps.push({ step: 1.1, obj: 'WG IP', name: ipTunnel, status: 'created', action: 'created' });
            repaired++;
          }
        }

        // Restaurar Peer WG
        if (wgPubKey) {
          const existsPeer = allWgPeers.some(p => p.interface === ifaceName && p['public-key'] === wgPubKey);
          if (existsPeer) {
            steps.push({ step: 1.2, obj: 'WG Peer', name: 'peer CPE', status: 'ok', action: 'exists' });
          } else {
            const ndMatch = ifaceName.match(/ND(\d+)/i);
            const ndComment = ndMatch ? `ND${ndMatch[1]}` : '';
            // Derivar IP del Peer usando el bloque WG
            const ipMatch = (ipTunnel || '').match(/10\.10\.251\.(\d+)/);
            let peerIp = '';
            if (ipMatch) {
              const blockBase = Math.floor(parseInt(ipMatch[1]) / 4) * 4;
              peerIp = `10.10.251.${blockBase + 2}/32`;
            }
            const allowedIps = peerIp ? `${peerIp},${(lanSubnets || []).join(',')}` : (lanSubnets || []).join(',');
            await writeIdempotent(api, [
              '/interface/wireguard/peers/add',
              `=interface=${ifaceName}`,
              `=public-key=${wgPubKey}`,
              `=allowed-address=${allowedIps}`,
              `=comment=Peer CPE ${ndComment}`,
            ]);
            steps.push({ step: 1.2, obj: 'WG Peer', name: 'peer CPE', status: 'created', action: 'created' });
            repaired++;
          }
        }
      } else {
        // Para SSTP: verificar/crear la interface SSTP server
        const existsSstp = allSstp.some(i => i.name === ifaceName);
        if (existsSstp) {
          steps.push({ step: 1, obj: 'SSTP Interface', name: ifaceName, status: 'ok', action: 'exists' });
        } else {
          await writeIdempotent(api, [
            '/interface/sstp-server/add',
            `=name=${ifaceName}`,
            `=user=${pppUser}`,
          ]);
          steps.push({ step: 1, obj: 'SSTP Interface', name: ifaceName, status: 'created', action: 'created' });
          repaired++;
        }
      }
    } catch (e) {
      steps.push({ step: 1, obj: isWG ? 'WG Interface' : 'SSTP Interface', name: ifaceName, status: 'error', action: e.message });
    }

    // ── Paso 2: Interface List Member (LIST-VPN-TOWERS) ────────────────────
    try {
      const existsMember = allMembers.some(m => m.interface === ifaceName && m.list === 'LIST-VPN-TOWERS');
      if (existsMember) {
        steps.push({ step: 2, obj: 'LIST-VPN-TOWERS member', name: ifaceName, status: 'ok', action: 'exists' });
      } else {
        await writeIdempotent(api, [
          '/interface/list/member/add',
          '=list=LIST-VPN-TOWERS',
          `=interface=${ifaceName}`,
        ]);
        steps.push({ step: 2, obj: 'LIST-VPN-TOWERS member', name: ifaceName, status: 'created', action: 'created' });
        repaired++;
      }
    } catch (e) {
      steps.push({ step: 2, obj: 'LIST-VPN-TOWERS member', name: ifaceName, status: 'error', action: e.message });
    }

    // ── Paso 3: VRF ─────────────────────────────────────────────────────────
    try {
      const existingVrf = allVrfs.find(v => v.name === vrfName);
      if (!existingVrf) {
        await writeIdempotent(api, [
          '/ip/vrf/add',
          `=name=${vrfName}`,
          `=interfaces=${ifaceName}`,
        ]);
        steps.push({ step: 3, obj: 'VRF', name: vrfName, status: 'created', action: 'created' });
        repaired++;
      } else {
        // VRF existe — verificar que la interfaz esté asignada
        const vrfIfaces = (existingVrf.interfaces || '').split(',').map(s => s.trim());
        if (!vrfIfaces.includes(ifaceName)) {
          const updatedIfaces = [...vrfIfaces.filter(Boolean), ifaceName].join(',');
          await safeWrite(api, [
            '/ip/vrf/set',
            `=.id=${existingVrf['.id']}`,
            `=interfaces=${updatedIfaces}`,
          ]);
          steps.push({ step: 3, obj: 'VRF', name: vrfName, status: 'created', action: 'added interface to existing VRF' });
          repaired++;
        } else {
          steps.push({ step: 3, obj: 'VRF', name: vrfName, status: 'ok', action: 'exists' });
        }
      }
    } catch (e) {
      steps.push({ step: 3, obj: 'VRF', name: vrfName, status: 'error', action: e.message });
    }

    // ── Paso 4: Rutas del VRF (LAN subnets + MGMT) ─────────────────────────
    const routeGw = `${ifaceName}@${vrfName}`;
    for (const subnet of lanSubnets) {
      try {
        const existsRoute = allRoutes.some(r =>
          r['dst-address'] === subnet &&
          r['routing-table'] === vrfName &&
          r.dynamic !== 'true'
        );
        if (existsRoute) {
          steps.push({ step: 4, obj: 'VRF Route LAN', name: subnet, status: 'ok', action: 'exists' });
        } else {
          await writeIdempotent(api, [
            '/ip/route/add',
            `=dst-address=${subnet}`,
            `=gateway=${routeGw}`,
            `=routing-table=${vrfName}`,
          ]);
          steps.push({ step: 4, obj: 'VRF Route LAN', name: subnet, status: 'created', action: 'created' });
          repaired++;
        }
      } catch (e) {
        steps.push({ step: 4, obj: 'VRF Route LAN', name: subnet, status: 'error', action: e.message });
      }
    }

    // Rutas de retorno del plano de gestión (una por segmento: CLIENTES/ADMIN/VPS)
    for (const rt of mgmtReturnRoutes) {
      try {
        const existsMgmtRoute = allRoutes.some(r =>
          r['dst-address'] === rt.subnet &&
          r['routing-table'] === vrfName &&
          r.dynamic !== 'true'
        );
        if (existsMgmtRoute) {
          steps.push({ step: 4, obj: 'VRF Route MGMT', name: rt.subnet, status: 'ok', action: 'exists' });
        } else {
          await writeIdempotent(api, [
            '/ip/route/add',
            `=dst-address=${rt.subnet}`,
            `=gateway=${rt.gateway}`,
            `=routing-table=${vrfName}`,
            '=distance=2',
          ]);
          steps.push({ step: 4, obj: 'VRF Route MGMT', name: rt.subnet, status: 'created', action: 'created' });
          repaired++;
        }
      } catch (e) {
        steps.push({ step: 4, obj: 'VRF Route MGMT', name: rt.subnet, status: 'error', action: e.message });
      }
    }

    // ── Paso 5: LIST-NET-REMOTE-TOWERS (subredes LAN) ───────────────────────
    for (const subnet of lanSubnets) {
      try {
        const existsInList = allAddrs.some(a =>
          a.list === 'LIST-NET-REMOTE-TOWERS' && a.address === subnet
        );
        if (existsInList) {
          steps.push({ step: 5, obj: 'LIST-NET-REMOTE-TOWERS', name: subnet, status: 'ok', action: 'exists' });
        } else {
          await writeIdempotent(api, [
            '/ip/firewall/address-list/add',
            '=list=LIST-NET-REMOTE-TOWERS',
            `=address=${subnet}`,
            '=comment=LAN Duplicadas',
          ]);
          steps.push({ step: 5, obj: 'LIST-NET-REMOTE-TOWERS', name: subnet, status: 'created', action: 'created' });
          repaired++;
        }
      } catch (e) {
        steps.push({ step: 5, obj: 'LIST-NET-REMOTE-TOWERS', name: subnet, status: 'error', action: e.message });
      }
    }

    // ── Paso 6: vpn-activa (pool de gestión completo: CLIENTES/ADMIN/VPS) ────
    const ADMIN_POOLS_REPAIR = [mgmtNet.clients.net, mgmtNet.admin.net, mgmtNet.vps.net];
    for (const pool of ADMIN_POOLS_REPAIR) {
      try {
        const existsInVpnActiva = allAddrs.some(a =>
          a.list === 'vpn-activa' && a.address === pool
        );
        if (existsInVpnActiva) {
          steps.push({ step: 6, obj: 'vpn-activa', name: pool, status: 'ok', action: 'exists' });
        } else {
          await writeIdempotent(api, [
            '/ip/firewall/address-list/add',
            '=list=vpn-activa',
            `=address=${pool}`,
            '=comment=User Access',
          ]);
          steps.push({ step: 6, obj: 'vpn-activa', name: pool, status: 'created', action: 'created' });
          repaired++;
        }
      } catch (e) {
        steps.push({ step: 6, obj: 'vpn-activa', name: pool, status: 'error', action: e.message });
      }
    }

    // ── Paso 7: Mangle de acceso POR-USUARIO (modelo multi-tenant) ─────────
    // Reemplaza la antigua regla GLOBAL `ACCESO-ADMIN` (src=192.168.21.0/24 → un
    // solo VRF), que el provisioner trata como LEGACY porque rompe el aislamiento
    // (marcaría TODA la /24 hacia un VRF, colisionando entre moderadores).
    //   7a. Elimina cualquier mangle legacy global (ACCESO-ADMIN/ACCESO-DINAMICO).
    //   7b. Recrea la mangle del solicitante (su mgmt_ip → su VRF), idempotente.
    // El gate es server-authoritative: usa la sesión activa (no un IP del body).
    try {
      const acc = req.account;
      const session = (acc?.sub && acc?.workspace_id)
        ? await sessionRepo.getActiveByUser(acc.workspace_id, acc.sub)
        : null;

      // 7a. Limpieza de reglas legacy globales presentes (snapshot inicial).
      const legacyIds = allMangle
        .filter(m => provisioner.LEGACY_GLOBAL_COMMENTS.includes(m.comment) && m['.id'])
        .map(m => m['.id']);
      if (legacyIds.length > 0) {
        await provisioner.removeMangleIds(api, legacyIds);
        steps.push({ step: 7, obj: 'Mangle legacy global', name: `${legacyIds.length} regla(s)`, status: 'created', action: 'removed (rompía aislamiento)' });
        repaired++;
      }

      // 7b. Mangle por-usuario del solicitante (solo si tiene sesión activa a este VRF).
      if (session && session.vrf_name === vrfName && session.mgmt_ip) {
        const present = allMangle.some(m =>
          m.comment === provisioner.mangleComment(acc.sub) &&
          m['src-address'] === session.mgmt_ip &&
          m['new-routing-mark'] === vrfName
        );
        if (present) {
          steps.push({ step: 7, obj: 'Mangle ACCESO-USER', name: `${session.mgmt_ip}→${vrfName}`, status: 'ok', action: 'exists' });
        } else {
          await provisioner.addUserMangle(api, { userId: acc.sub, mgmtIp: session.mgmt_ip, vrfName });
          steps.push({ step: 7, obj: 'Mangle ACCESO-USER', name: `${session.mgmt_ip}→${vrfName}`, status: 'created', action: 'created' });
          repaired++;
        }
      } else {
        steps.push({ step: 7, obj: 'Mangle ACCESO-USER', name: null, status: 'skipped', action: 'sin sesión activa del solicitante para este VRF' });
      }
    } catch (e) {
      steps.push({ step: 7, obj: 'Mangle por-usuario', name: null, status: 'error', action: e.message });
    }

    await api.close();
    log.info({ pppUser, vrfName, repaired, total: steps.length }, 'TUNNEL-REPAIR');
    res.json({ success: true, steps, repaired });

  } catch (error) {
    if (api) try { await api.close(); } catch (_) { }
    const msg = getErrorMessage(error, ip, user);
    log.error({ err: error?.message }, 'TUNNEL-REPAIR Error');
    res.status(500).json({ success: false, message: msg });
  }
});

module.exports = router;
