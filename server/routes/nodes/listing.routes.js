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
const { getDb, saveNode, getNodes } = require('../../db.service');
const { annotateSessions, filterNodesForRole, nodeBelongsToRequester, requireOperator } = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { mikrotikAppError } = require('../../lib/mikrotikError');
const { requireMikrotik } = require('../../lib/routeGuards');
const mgmtNet = require('../../lib/mgmtNet');

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
    let ipTunnel = '';
    let serverPublicKey = '<CLAVE_PUBLICA_SERVIDOR>';
    let wgPort = 13300;
    let wgNodeNum = 0;

    try {
      const db = await getDb();
      const nodeRow = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
      if (nodeRow) {
        ipTunnel = nodeRow.ip_tunnel || '';
        // Derive node number from interface name pattern (WG-NDx-NAME)
        wgNodeNum = parseInt(pppUser.match(/ND(\d+)/)?.[1] || '0');
      }
      if (req.mikrotik) {
        const { ip, user, pass } = req.mikrotik;
        const api = await connectToMikrotik(ip, user, pass);
        const info = await safeWrite(api, ['/interface/wireguard/print', `?name=${pppUser}`]);
        if (info && info.length > 0) {
          serverPublicKey = info[0]['public-key'] || serverPublicKey;
          wgPort = parseInt(info[0]['listen-port'] || '0') || (13300 + parseInt(wgNodeNum));
        }
        await api.close();
      } else {
        wgPort = 13300 + parseInt(wgNodeNum);
      }
    } catch (_) { /* derivar lo que se pueda — script lleva placeholders */ }

    const peerOct = parseInt((ipTunnel || '10.10.251.2').split('.')[3] ?? '2');
    const blockBase30 = peerOct - 2;
    const tunnelNet30 = `10.10.251.${blockBase30}/30`;
    const tunnelAddr = ipTunnel || `10.10.251.${wgNodeNum * 4 - 2}`;

    // Redes de gestión que el CPE debe alcanzar de vuelta (CLIENTES/ADMIN/VPS)
    // + el /24 del scan-pool del VPS (si está configurado) + IP de gestión del nodo.
    const SCAN_RETURN_SUBNET = (process.env.SCAN_RETURN_SUBNET || '').trim();
    const mgmtNets = mgmtNet.returnRoutes().map(r => r.subnet);
    const returnNets = [...mgmtNets, ...(SCAN_RETURN_SUBNET ? [SCAN_RETURN_SUBNET] : [])];
    const allowedCsv = [...returnNets, tunnelNet30].join(',');
    const nodeMgmt = mgmtNet.nodeMgmtIp(wgNodeNum, true);
    const mgmtIpLine = nodeMgmt
      ? `/ip address add address=${nodeMgmt}/32 interface=WG-CORE-ISP comment="IP de gestion del nodo ND${wgNodeNum}"`
      : '';
    const peerLine = `/interface wireguard peers add interface=WG-CORE-ISP public-key="${serverPublicKey}" endpoint-address=${serverPublicIP} endpoint-port=${wgPort} allowed-address=${allowedCsv} persistent-keepalive=25s comment="Conexion al Servidor Core"`;
    const routeLines = returnNets.map(n => `/ip route add dst-address=${n} distance=20 gateway=WG-CORE-ISP comment="Retorno hacia Administracion/Software"`);

    const script = [
      `/interface wireguard add name=WG-CORE-ISP mtu=1420 comment="Conexion al Servidor Core"`,
      `/ip address add address=${tunnelAddr}/30 interface=WG-CORE-ISP network=10.10.251.${blockBase30} comment="IP WG Cliente ND${wgNodeNum}"`,
      ...(mgmtIpLine ? [mgmtIpLine] : []),
      peerLine,
      ...routeLines,
    ].join('\n') + '\n';
    const cpeSteps = [
      { title: 'Crear interfaz WireGuard', cmd: `/interface wireguard add name=WG-CORE-ISP mtu=1420 comment="Conexion al Servidor Core"` },
      { title: 'Asignar IP al túnel (/30)', cmd: `/ip address add address=${tunnelAddr}/30 interface=WG-CORE-ISP network=10.10.251.${blockBase30} comment="IP WG Cliente ND${wgNodeNum}"` },
      ...(mgmtIpLine ? [{ title: 'IP de gestión del nodo', cmd: mgmtIpLine }] : []),
      { title: 'Agregar peer (servidor Core)', cmd: peerLine },
      ...returnNets.map(n => ({ title: `Ruta de retorno (${n})`, cmd: `/ip route add dst-address=${n} distance=20 gateway=WG-CORE-ISP comment="Retorno hacia Administracion/Software"` })),
    ];
    return sendOk(res, { script, cpeSteps });
  }

  if (!pppPassword) throw new AppError('pppPassword es requerido para SSTP', 400, 'VALIDATION_ERROR');
  // Si sstp-out1 ya existe, solo actualiza sus parámetros (evita crear interfaz dinámica duplicada DR).
  // Si no existe, la crea desde cero.
  const script = `/interface sstp-client
:if ([find name=sstp-out1] = "") do={
  add authentication=mschap2 connect-to=${serverPublicIP} disabled=no http-proxy=0.0.0.0 name=sstp-out1 profile=default-encryption tls-version=only-1.2 user=${pppUser} password=${pppPassword}
} else={
  set [find name=sstp-out1] connect-to=${serverPublicIP} disabled=no user=${pppUser} password=${pppPassword}
}`;
  const cpeSteps = [
    { title: 'Configurar Cliente SSTP', cmd: `/interface sstp-client\n:if ([find name=sstp-out1] = "") do={\n  add authentication=mschap2 connect-to=${serverPublicIP} disabled=no http-proxy=0.0.0.0 name=sstp-out1 profile=default-encryption tls-version=only-1.2 user=${pppUser} password=${pppPassword}\n} else={\n  set [find name=sstp-out1] connect-to=${serverPublicIP} disabled=no user=${pppUser} password=${pppPassword}\n}` },
  ];
  return sendOk(res, { script, cpeSteps });
}));

// POST /node/wg/set-peer — Agrega o actualiza el peer CPE en un nodo WireGuard existente
router.post('/node/wg/set-peer', requireOperator, asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { pppUser, cpePublicKey } = req.body;
  if (!pppUser || !cpePublicKey) {
    throw new AppError('pppUser y cpePublicKey son requeridos', 400, 'VALIDATION_ERROR');
  }
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);

    // Leer IPs de la interfaz WG para calcular peerIP
    const allAddrs = (await safeWrite(api, ['/ip/address/print'])) || [];
    const wgAddr = allAddrs.find(a => a.interface === pppUser && (a.address || '').startsWith('10.10.251.'));
    if (!wgAddr) {
      await api.close();
      throw new AppError(`No se encontró IP WireGuard para ${pppUser}`, 404, 'NOT_FOUND');
    }
    // Server IP es .X en la dirección, peer IP es .X+1
    // Ej: address=10.10.251.1/30 → serverOct=1 → peerOct=2
    const serverOct = parseInt((wgAddr.address || '').split('/')[0].split('.')[3]);
    const peerOct = serverOct + 1;
    const peerIP = `10.10.251.${peerOct}`;

    // Obtener LAN subnets del nodo desde MySQL
    const db = await getDb();
    const nodeRow = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
    let lanSubnets = [];
    if (nodeRow) {
      if (nodeRow.segmento_lan) lanSubnets = [nodeRow.segmento_lan];
    }
    const allowedAddress = [`${peerIP}/32`, ...lanSubnets].join(',');

    // Eliminar peer existente si hay uno en esta interfaz
    const existingPeers = (await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => [])) || [];
    const peerToRemove = existingPeers.find(p => p.interface === pppUser);
    if (peerToRemove) {
      await safeWrite(api, ['/interface/wireguard/peers/remove', `=.id=${peerToRemove['.id']}`]);
    }

    // Agregar nuevo peer con la clave del CPE
    await safeWrite(api, ['/interface/wireguard/peers/add',
      `=interface=${pppUser}`,
      `=public-key=${cpePublicKey}`,
      `=allowed-address=${allowedAddress}`,
      `=comment=Cliente`,
    ]);

    await api.close();
    return sendOk(res, { message: `Peer CPE configurado: ${peerIP} + ${lanSubnets.join(', ')}`, peerIP, allowedAddress });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw mikrotikAppError(error, ip, user, pass);
  }
}));

module.exports = router;
