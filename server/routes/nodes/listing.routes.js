// ============================================================
//  routes/nodes/listing.routes.js — listado e inspección de nodos
//
//   POST /nodes              → catálogo SSTP+WG con fallback caché MySQL
//   POST /node/details       → datos para el modal de edición
//   POST /node/script        → script CPE (SSTP o WG) para copy/paste
//   POST /node/wg/set-peer   → set/replace del peer WG del CPE
// ============================================================

const express = require('express');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'nodes:listing' });
const {
  connectToMikrotik, safeWrite, getErrorMessage, parseHandshakeSecs,
} = require('../../routeros.service');
const { getDb, saveNode, getNodes, decryptPass, encryptPass, getAppSetting } = require('../../db.service');
const { generateKeyPair } = require('../../lib/wgkeys');
const { annotateSessions, filterNodesForRole, nodeBelongsToRequester, requireOperator } = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { mikrotikAppError } = require('../../lib/mikrotikError');
const { requireMikrotik } = require('../../lib/routeGuards');
const mgmtNet = require('../../lib/mgmtNet');
const { buildCpeWgScript, buildCpeSstpScript } = require('../../lib/cpeScript');
const scanIpRepo = require('../../db/repos/scanIpRepo');

// /24 del plano de gestión — se excluyen del listado de "LANs de nodo".
const MGMT_NETS = new Set(mgmtNet.allNets);

// NOTA: el endpoint /nodes históricamente responde con un ARRAY plano (no shape
// { success, ... }). El frontend lo consume así. Mantengo el shape legacy para
// no romper la UI. F5.C considera migrarlo a sendOk(res, { nodes: [...] }).
router.post('/nodes', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
    const secrets    = await safeWrite(api, ['/ppp/secret/print']);
    const wgIfaces   = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
    const wgPeers    = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
    const vrfs       = await safeWrite(api, ['/ip/vrf/print']);
    const active     = await safeWrite(api, ['/ppp/active/print']);
    const sstpIfaces = await safeWrite(api, ['/interface/sstp-server/print']);
    const routes     = await safeWrite(api, ['/ip/route/print']);
    await api.close();

    const vrfByInterface = {}; vrfs.forEach(vrf => (vrf.interfaces || '').split(',').forEach(i => { if (i.trim()) vrfByInterface[i.trim()] = vrf.name; }));
    const sstpIfaceByUser = {}; sstpIfaces.forEach(i => { if (i.user && i.name) sstpIfaceByUser[i.user] = i.name; });
    const activeByName = {}; active.forEach(s => { if (s.name) activeByName[s.name] = { address: s.address, uptime: s.uptime }; });
    const sysRoutesByVrf = {}; (routes || []).forEach(r => { if (r['routing-table'] && r['routing-table'] !== 'main' && !r['dst-address']?.endsWith('/32') && !MGMT_NETS.has(r['dst-address']) && r.dynamic !== 'true') { if (!sysRoutesByVrf[r['routing-table']]) sysRoutesByVrf[r['routing-table']] = []; sysRoutesByVrf[r['routing-table']].push(r['dst-address']); } });

    // ── Nodos SSTP (PPP secrets con service=sstp) ───────────────────────────
    const sstpNodes = secrets.filter(s => s.service === 'sstp').map(secret => {
      const name = secret.name || 'Unknown';
      const session = activeByName[name];
      const nombreVrf = vrfByInterface[sstpIfaceByUser[name] || ''] || '';
      return {
        id: secret['.id'], nombre_nodo: (secret.comment || name).replace(/Torre|torre|-ND\d+/gi, '').trim() || name,
        ppp_user: name, segmento_lan: secret.routes || (sysRoutesByVrf[nombreVrf]?.[0] || ''), lan_subnets: sysRoutesByVrf[nombreVrf] || [], nombre_vrf: nombreVrf,
        service: 'sstp', disabled: secret.disabled === 'true' || secret.disabled === true,
        running: !!session, ip_tunnel: session ? session.address : '', uptime: session ? session.uptime : '',
      };
    });

    // ── Nodos WireGuard (interfaces WG-NDx-*, excluyendo VPN-WG-MGMT y otras WG de gestión) ──
    const wgTorreIfaces = (wgIfaces || []).filter(i => /^WG-ND\d+/i.test(i.name || ''));
    const wgNodes = wgTorreIfaces.map(iface => {
      const ifaceName = iface.name;
      const vrfName = vrfByInterface[ifaceName] || '';
      const peer = (wgPeers || []).find(p => p.interface === ifaceName);
      const vrfRoutes = (routes || []).filter(r =>
        r['routing-table'] === vrfName &&
        !r['dst-address']?.endsWith('/32') &&
        !MGMT_NETS.has(r['dst-address']) &&
        r.dynamic !== 'true'
      );
      const lanSubnets = vrfRoutes.map(r => r['dst-address']).filter(Boolean);
      const lastHs = peer?.['last-handshake'] || '';
      const lastHsSecs = parseHandshakeSecs(lastHs);
      const ifaceRunning = iface.running === 'true' || iface.running === true;
      // Conectado = peer con handshake reciente; Activo sin peer = interfaz levantada pero sin peer aún
      const peerConnected = peer && lastHsSecs < 300;
      const running = ifaceRunning || peerConnected;
      // Si el comment es solo "NDx" (ej. "ND4" puesto por el provisioning), ignorarlo
      // y derivar el nombre real del nombre de la interfaz (ej. WG-ND4-TORRESANANTONIO → TORRESANANTONIO)
      const rawComment = iface.comment || '';
      const nombre = (rawComment && !/^ND\d+$/i.test(rawComment.trim()))
        ? rawComment
        : ifaceName.replace(/^WG-ND\d+-/i, '').replace(/-/g, ' ').trim();
      return {
        id: iface['.id'],
        nombre_nodo: nombre,
        ppp_user: ifaceName,
        segmento_lan: lanSubnets[0] || '',
        lan_subnets: lanSubnets,
        nombre_vrf: vrfName,
        service: 'wireguard',
        disabled: iface.disabled === 'true' || iface.disabled === true,
        running,
        ip_tunnel: peer?.['current-endpoint-address'] || '',
        uptime: running ? lastHs : '',
        wg_public_key: peer?.['public-key'] || '',
        wg_listen_port: parseInt(iface['listen-port'] || '0') || 0,
        wg_last_handshake_secs: isFinite(lastHsSecs) ? lastHsSecs : null,
        wg_allowed_ips: peer?.['allowed-address'] || '',
      };
    });

    let nodes = [...sstpNodes, ...wgNodes];

    // --- Merge etiquetas personalizadas desde MySQL (tienen prioridad sobre el comment de MikroTik) ---
    try {
      const db = await getDb();
      const labelRows = await db.all('SELECT ppp_user, label FROM nodes WHERE label IS NOT NULL AND label != \'\'');
      const labelMap = {};
      labelRows.forEach(r => { if (r.label) labelMap[r.ppp_user] = r.label; });
      nodes = nodes.map(n => labelMap[n.ppp_user] ? { ...n, nombre_nodo: labelMap[n.ppp_user] } : n);
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: merge labels');
    }

    // --- Actualizar caché MySQL con el estado actual de MikroTik ---
    try {
      for (const n of nodes) {
        // Para WG: ppp_user === ifaceName (VPN-WG-NDx-NOMBRE), iface_name igual
        // Para SSTP: iface_name se deriva del VRF
        const ifaceName = n.service === 'wireguard'
          ? n.ppp_user
          : (n.nombre_vrf ? n.nombre_vrf.replace(/^VRF-/, 'VPN-SSTP-') : '');
        await saveNode({
          ppp_user: n.ppp_user,
          nombre_nodo: n.nombre_nodo,
          nombre_vrf: n.nombre_vrf,
          iface_name: ifaceName,
          segmento_lan: n.segmento_lan,
          lan_subnets: n.lan_subnets,
          ip_tunnel: n.ip_tunnel,
          protocol: n.service,
          last_seen: Date.now(),
        });
      }
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: actualizar caché de nodos');
    }

    return res.json(await annotateSessions(req, await filterNodesForRole(req, nodes)));
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }

    // --- Fallback: retornar nodos desde caché MySQL si MikroTik no responde ---
    try {
      const cached = await getNodes();
      if (cached.length > 0) {
        log.warn('DB: MikroTik no disponible — sirviendo nodos desde caché MySQL');
        const offlineNodes = cached.map(n => ({
          ...n,
          running: false,
          uptime: '',
          ip_tunnel: n.ip_tunnel || '',
          cached: true,   // flag para el frontend
        }));
        return res.json(await annotateSessions(req, await filterNodesForRole(req, offlineNodes)));
      }
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: leer caché de nodos');
    }

    if (error instanceof AppError) throw error;
    throw mikrotikAppError(error, ip, user);
  }
}));

router.post('/node/details', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { vrfName, pppUser } = req.body;
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
    const routes   = vrfName ? await safeWrite(api, ['/ip/route/print']) : [];
    const addrList = vrfName ? await safeWrite(api, ['/ip/firewall/address-list/print']) : [];
    const secrets  = pppUser ? await safeWrite(api, ['/ppp/secret/print']) : [];
    const vrfSubnets = routes
      .filter(r => r['routing-table'] === vrfName && !MGMT_NETS.has(r['dst-address']))
      .map(r => r['dst-address']);
    const lanSubnets = addrList
      .filter(a => a.list === 'LIST-NET-REMOTE-TOWERS' && vrfSubnets.includes(a.address))
      .map(a => a.address);
    const secret = secrets.find(s => s.name === pppUser);
    const isWG = pppUser && (pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-'));

    const db = await getDb();
    const nodeRow = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
    let ipTunnel = '';
    if (nodeRow) {
      ipTunnel = nodeRow.ip_tunnel || '';
    }

    await api.close();
    return sendOk(res, {
      lanSubnets: lanSubnets.length > 0 ? lanSubnets : vrfSubnets,
      remoteAddress: isWG ? ipTunnel : (secret?.['remote-address'] || ipTunnel || ''),
      currentPppUser: isWG ? pppUser : (secret?.name || pppUser || ''),
      pppPassword: '********',   // Nunca enviar la contraseña real al frontend
    });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw mikrotikAppError(error, ip, user);
  }
}));

router.post('/node/script', asyncHandler(async (req, res) => {
  const { pppUser, pppPassword, serverPublicIP } = req.body;
  if (!pppUser || !serverPublicIP) {
    throw new AppError('pppUser y serverPublicIP son requeridos', 400, 'VALIDATION_ERROR');
  }

  const isWG = pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');

  if (isWG) {
    let serverPublicKey = '<CLAVE_PUBLICA_SERVIDOR>';
    let wgPort = 13300;
    let wgNodeNum = parseInt(pppUser.match(/ND(\d+)/)?.[1] || '0');
    let cpePrivateKey = '';

    try {
      const db = await getDb();
      const nodeRow = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
      if (nodeRow) {
        // Privada del CPE generada por el servidor → se embebe para que el nodo
        // quede autoconfigurado sin pedir/copiar la llave (mismo modelo que el .conf
        // de usuario). Si el nodo es legacy (sin par generado), el script cae al
        // flujo manual (interfaz sin private-key → el CPE genera la suya).
        cpePrivateKey = nodeRow.wg_cpe_private_enc ? decryptPass(nodeRow.wg_cpe_private_enc) : '';
      }
      if (req.mikrotik) {
        const { ip, user, pass } = req.mikrotik;
        const api = await connectToMikrotik(ip, user, pass);
        const info = await safeWrite(api, ['/interface/wireguard/print', `?name=${pppUser}`]);
        if (info && info.length > 0) {
          serverPublicKey = info[0]['public-key'] || serverPublicKey;
          wgPort = parseInt(info[0]['listen-port'] || '0') || (13300 + wgNodeNum);
        }
        await api.close();
      } else {
        wgPort = 13300 + wgNodeNum;
      }
    } catch (_) { /* derivar lo que se pueda — script lleva placeholders */ }

    // Modelo unificado: el CPE tiene UNA sola IP (= IP del nodo), que es a la vez
    // el extremo del túnel WG. Sin /30 de transporte.
    const nodeMgmt = mgmtNet.nodeMgmtIp(wgNodeNum, true);
    if (!nodeMgmt) throw new AppError(`Número de nodo inválido (ND${wgNodeNum}); use ND ≥ 2`, 400, 'VALIDATION_ERROR');

    // Redes de gestión que el CPE debe alcanzar de vuelta (CLIENTES/ADMIN/VPS)
    // + el /24 del scan-pool del VPS (derivado del pool, igual que en provisión).
    const scanSubnet = (process.env.SCAN_RETURN_SUBNET || scanIpRepo.poolSubnet() || '').trim();
    const mgmtNets = mgmtNet.returnRoutes().map(r => r.subnet);
    const returnNets = [...mgmtNets, ...(scanSubnet ? [scanSubnet] : [])];

    const { script, cpeSteps } = buildCpeWgScript({
      nodeNum: wgNodeNum, nodeMgmt, serverPublicKey, serverPublicIP, wgPort, returnNets, cpePrivateKey,
    });
    return sendOk(res, { script, cpeSteps, keyMode: cpePrivateKey ? 'generated' : 'manual' });
  }

  if (!pppPassword) throw new AppError('pppPassword es requerido para SSTP', 400, 'VALIDATION_ERROR');
  // Script idempotente: crea sstp-out1 si no existe, o solo actualiza sus parámetros
  // (evita duplicar la interfaz). Usuario + contraseña embebidos (autoconfigurable).
  // El puerto del listener SSTP del Core sale del setting global (default 443).
  const sstpPort = (await getAppSetting('sstp_port').catch(() => '')) || '';
  const { script, cpeSteps } = buildCpeSstpScript({ pppUser, pppPassword, serverPublicIP, sstpPort });
  return sendOk(res, { script, cpeSteps });
}));

// POST /node/wg/set-peer — Agrega o actualiza el peer CPE en un nodo WireGuard existente.
//  Modos:
//   - cpePublicKey presente → modo manual (el operador pega la pública del CPE).
//   - cpePublicKey ausente   → modo auto: el servidor GENERA el par, registra la
//     pública en el peer del Core y devuelve el script con la privada embebida.
router.post('/node/wg/set-peer', requireOperator, asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { pppUser, cpePublicKey } = req.body;
  if (!pppUser) {
    throw new AppError('pppUser es requerido', 400, 'VALIDATION_ERROR');
  }
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }

  // Auto-gen cuando no llega una clave del CPE (mismo modelo que la provisión).
  const cpeKeys = cpePublicKey ? null : generateKeyPair();
  const effectiveCpePublic = cpePublicKey || cpeKeys.publicKey;
  const keyMode = cpePublicKey ? 'manual' : 'generated';

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);

    // IP única del nodo (transporte + gestión) derivada del número de nodo.
    const wgNodeNum = parseInt((pppUser.match(/ND(\d+)/) || [])[1] || '0', 10);
    const nodeMgmt = mgmtNet.nodeMgmtIp(wgNodeNum, true);
    if (!nodeMgmt) {
      await api.close();
      throw new AppError(`No se pudo derivar la IP del nodo para ${pppUser} (ND ≥ 2)`, 400, 'VALIDATION_ERROR');
    }

    // Obtener LAN subnets del nodo desde MySQL
    const db = await getDb();
    const nodeRow = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
    let lanSubnets = [];
    if (nodeRow) {
      if (nodeRow.segmento_lan) lanSubnets = [nodeRow.segmento_lan];
    }
    const allowedAddress = [`${nodeMgmt}/32`, ...lanSubnets].join(',');

    // Eliminar peer existente si hay uno en esta interfaz
    const existingPeers = (await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => [])) || [];
    const peerToRemove = existingPeers.find(p => p.interface === pppUser);
    if (peerToRemove) {
      await safeWrite(api, ['/interface/wireguard/peers/remove', `=.id=${peerToRemove['.id']}`]);
    }

    // Agregar nuevo peer con la clave del CPE (pegada o autogenerada)
    await safeWrite(api, ['/interface/wireguard/peers/add',
      `=interface=${pppUser}`,
      `=public-key=${effectiveCpePublic}`,
      `=allowed-address=${allowedAddress}`,
      `=comment=Cliente`,
    ]);

    // Server public key + listen-port (para el script de retorno)
    let serverPublicKey = '<CLAVE_PUBLICA_SERVIDOR>';
    let wgPort = 13300 + wgNodeNum;
    const info = (await safeWrite(api, ['/interface/wireguard/print', `?name=${pppUser}`]).catch(() => [])) || [];
    if (info.length > 0) {
      serverPublicKey = info[0]['public-key'] || serverPublicKey;
      wgPort = parseInt(info[0]['listen-port'] || '0') || wgPort;
    }

    await api.close();

    // Persistir la pública del CPE (peer del Core) + la privada cifrada si la generamos
    await saveNode({
      ppp_user: pppUser,
      nombre_nodo: nodeRow?.nombre_nodo || '', nombre_vrf: nodeRow?.nombre_vrf || '',
      iface_name: nodeRow?.iface_name || pppUser, protocol: 'wireguard',
      wg_cpe_public: effectiveCpePublic,
      wg_cpe_private_enc: cpeKeys ? encryptPass(cpeKeys.privateKey) : null,
    }).catch(e => log.warn({ err: e.message }, 'set-peer: persistir llaves CPE'));

    // Script CPE listo (con privada embebida si fue autogenerada)
    let cpeScript = null, cpeSteps = null;
    try {
      const serverPublicIP = (await getAppSetting('server_public_ip').catch(() => '')) || ip;
      const scanSubnet = (process.env.SCAN_RETURN_SUBNET || scanIpRepo.poolSubnet() || '').trim();
      const returnNets = [...mgmtNet.returnRoutes().map(r => r.subnet), ...(scanSubnet ? [scanSubnet] : [])];
      ({ script: cpeScript, cpeSteps } = buildCpeWgScript({
        nodeNum: wgNodeNum, nodeMgmt, serverPublicKey, serverPublicIP, wgPort, returnNets,
        cpePrivateKey: cpeKeys ? cpeKeys.privateKey : '',
      }));
    } catch (e) { log.warn({ err: e.message }, 'set-peer: pre-generar script'); }

    return sendOk(res, {
      message: `Peer CPE configurado (${keyMode}): ${nodeMgmt} + ${lanSubnets.join(', ')}`,
      peerIP: nodeMgmt, allowedAddress, keyMode, cpeScript, cpeSteps,
    });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw mikrotikAppError(error, ip, user, pass);
  }
}));

module.exports = router;
