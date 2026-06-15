// ============================================================
//  routes/nodes/provision.routes.js — alta y baja de túneles
//
//   POST /node/next         → siguiente ND y remote-address libres
//   POST /node/provision    → alta SSTP o WireGuard (10 pasos atómicos)
//   POST /node/deprovision  → baja con limpieza en cascada
// ============================================================

const express = require('express');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'nodes:provision' });
const {
  connectToMikrotik, safeWrite, getErrorMessage, writeIdempotent,
} = require('../../routeros.service');
const { IPV4_REGEX, CIDR_REGEX } = require('../../ubiquiti.service');
const { getDb, encryptPass, saveNode, deleteNode } = require('../../db.service');
const { nodeBelongsToRequester } = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { requireMikrotik } = require('../../lib/routeGuards');

router.post('/node/next', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
    const vrfs    = await safeWrite(api, ['/ip/vrf/print']);
    const secrets = await safeWrite(api, ['/ppp/secret/print']);
    await api.close();

    // Extraer números de nodo de los VRFs existentes (VRF-ND1-..., VRF-ND2-...)
    const ndNumbers = vrfs
      .map(v => { const m = (v.name || '').match(/ND(\d+)/i); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0);
    const maxNd = ndNumbers.length > 0 ? Math.max(...ndNumbers) : 0;
    const nextNode = maxNd + 1;

    // Extraer IPs remotas usadas (10.10.250.x) para evitar colisiones
    const usedRemote = secrets
      .map(s => s['remote-address'] || '')
      .filter(a => a.startsWith('10.10.250.'))
      .map(a => parseInt(a.split('.')[3]))
      .filter(n => !isNaN(n));
    const maxRemote = usedRemote.length > 0 ? Math.max(...usedRemote) : 200;
    const nextRemote = `10.10.250.${maxRemote + 1}`;

    return sendOk(res, { nextNode, nextRemote });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(getErrorMessage(error, ip, user), 500, 'MIKROTIK_ERROR');
  }
}));

router.post('/node/provision', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { nodeNumber, nodeName, pppUser, pppPassword, lanSubnet, lanSubnets, remoteAddress, protocol, cpePublicKey, wgListenPort } = req.body;
  const isWG = protocol === 'wireguard';
  const allSubnets = Array.isArray(lanSubnets) && lanSubnets.length > 0 ? lanSubnets : [lanSubnet].filter(Boolean);
  if (allSubnets.length === 0 || !allSubnets.every(s => CIDR_REGEX.test(s)))
    throw new AppError('CIDRs de LAN inválidos', 400, 'VALIDATION_ERROR');
  if (!isWG && !IPV4_REGEX.test(remoteAddress))
    throw new AppError('IP remota inválida', 400, 'VALIDATION_ERROR');
  // cpePublicKey es opcional en WireGuard — el peer se agrega después si no se proporcionó
  if (!isWG && (!pppUser || !pppPassword)) throw new AppError('Usuario y Contraseña requeridos para SSTP', 400, 'VALIDATION_ERROR');

  const steps = []; let api;
  const ndNum = parseInt(nodeNumber, 10);
  const nameUpper = nodeName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // WG usa nombre sin prefijo VPN-; SSTP mantiene prefijo VPN-SSTP-
  const ifaceName = isWG ? `WG-ND${ndNum}-${nameUpper}` : `VPN-SSTP-ND${ndNum}-${nameUpper}`;
  const vrfName = `VRF-ND${ndNum}-${nameUpper}`;
  const ndComment = `ND${ndNum}`;
  // Puerto: 13300 + número de nodo (ej. ND1=13301, ND7=13307)
  const wgPort = wgListenPort ? parseInt(wgListenPort, 10) : (13300 + ndNum);
  let wgPeerIP = '';
  let serverPublicKey = '';

  try {
    api = await connectToMikrotik(ip, user, pass);

    if (isWG) {
      // Calcular siguiente bloque /30 disponible en 10.10.251.0/24
      // Cada nodo WG ocupa un /30: bloque 0=.0/30(.1/.2), bloque 1=.4/30(.5/.6), etc.
      const allAddrs = await safeWrite(api, ['/ip/address/print']) || [];
      let highestBase = -4;
      for (const a of allAddrs) {
        if ((a.interface || '').match(/^WG-ND\d+/)) {
          const m = (a.address || '').match(/10\.10\.251\.(\d+)/);
          if (m) {
            const oct = parseInt(m[1]);
            const base = Math.floor(oct / 4) * 4;
            if (base > highestBase) highestBase = base;
          }
        }
      }
      const blockBase = highestBase + 4;
      const serverIPAddr = `10.10.251.${blockBase + 1}/30`;
      const blockNetwork = `10.10.251.${blockBase}`;
      wgPeerIP = `10.10.251.${blockBase + 2}`;

      // Paso 1 — Interface WG (comment = nombre real del nodo para mostrarse en la UI)
      await writeIdempotent(api, ['/interface/wireguard/add',
        `=name=${ifaceName}`, `=listen-port=${wgPort}`, `=mtu=1420`, `=comment=${nodeName}`]);
      steps.push({ step: 1, obj: 'WG Interface', name: `${ifaceName} port=${wgPort}`, status: 'ok' });

      // Obtener Server Public Key
      const wgInfo = await safeWrite(api, ['/interface/wireguard/print', `?name=${ifaceName}`]);
      if (wgInfo && wgInfo.length > 0) serverPublicKey = wgInfo[0]['public-key'];

      // Paso 2 — IP /30 en la interface del servidor
      await writeIdempotent(api, ['/ip/address/add',
        `=address=${serverIPAddr}`, `=network=${blockNetwork}`,
        `=interface=${ifaceName}`, `=comment=IP Core a ${ndComment}`]);
      steps.push({ step: 2, obj: 'WG IP', name: `${serverIPAddr} (peer=${wgPeerIP})`, status: 'ok' });

      // Paso 3 — Peer WG (CPE) — solo si se proporcionó la clave pública del CPE
      const subnetsList = allSubnets.join(',');
      if (cpePublicKey) {
        await writeIdempotent(api, ['/interface/wireguard/peers/add',
          `=interface=${ifaceName}`, `=public-key=${cpePublicKey}`,
          `=allowed-address=${wgPeerIP}/32,${subnetsList}`, `=comment=Cliente ${ndComment}`]);
        steps.push({ step: 3, obj: 'WG Peer', name: `${wgPeerIP}/32 + ${subnetsList}`, status: 'ok' });
      } else {
        steps.push({ step: 3, obj: 'WG Peer', name: 'Omitido — sin clave CPE (agregar después)', status: 'ok' });
      }

      // Paso 4 — LIST-VPN-TOWERS (y LIST-VPN-WG para Wireguard)
      await writeIdempotent(api, ['/interface/list/member/add',
        `=interface=${ifaceName}`, '=list=LIST-VPN-TOWERS']);
      await writeIdempotent(api, ['/interface/list/member/add',
        `=interface=${ifaceName}`, '=list=LIST-VPN-WG']);
      steps.push({ step: 4, obj: 'Interface List (LIST-VPN-TOWERS & WG)', name: ifaceName, status: 'ok' });

      // Paso 5 — VRF: si ya existe (nodo SSTP previo), agregar interfaz WG; si no, crear
      // VRF: traer todos sin filtro (evita timeout con ?name=) y buscar en JS
      let allVrfs = [];
      try { allVrfs = (await safeWrite(api, ['/ip/vrf/print'])) || []; } catch (_) { allVrfs = []; }
      const existingVrfEntry = allVrfs.find(v => v.name === vrfName);
      if (existingVrfEntry) {
        const currentIfaces = existingVrfEntry.interfaces || '';
        const ifaceAlreadyIn = currentIfaces.split(',').map(s => s.trim()).includes(ifaceName);
        if (!ifaceAlreadyIn) {
          const ifaceList = currentIfaces ? `${currentIfaces},${ifaceName}` : ifaceName;
          await safeWrite(api, ['/ip/vrf/set', `=numbers=${existingVrfEntry['.id']}`, `=interfaces=${ifaceList}`]);
        }
        steps.push({ step: 5, obj: 'VRF (WG agregada al VRF existente)', name: `${vrfName} ← ${ifaceName}`, status: 'ok' });
      } else {
        await safeWrite(api, ['/ip/vrf/add', `=name=${vrfName}`, `=interfaces=${ifaceName}`]);
        steps.push({ step: 5, obj: 'VRF', name: vrfName, status: 'ok' });
        await new Promise(r => setTimeout(r, 800));
      }

      // Paso 6 — Firewall: el rango 13300-13400 ya está cubierto por la regla global
      // "Permitir todos los tuneles WG Nodos" — no se crean reglas individuales por nodo
      steps.push({ step: 6, obj: 'Firewall UDP', name: `puerto ${wgPort} cubierto por regla global 13300-13400`, status: 'ok' });

      // Paso 7a — Rutas LAN con distance=2 (backup al SSTP si coexisten)
      const subnets = allSubnets;
      for (const subnet of subnets) {
        await writeIdempotent(api, ['/ip/route/add',
          `=dst-address=${subnet}`,
          `=gateway=${ifaceName}@${vrfName}`,
          `=routing-table=${vrfName}`,
          '=distance=2',
          '=scope=30', '=target-scope=10',
          `=comment=Ruta WG ${ndComment}`]);
      }
      steps.push({ step: '7a', obj: 'Rutas LAN remota(s)', name: `${subnets.join(', ')} (distance=2)`, status: 'ok' });

      // Paso 7b — Ruta retorno MGMT
      await writeIdempotent(api, ['/ip/route/add',
        '=dst-address=192.168.21.0/24',
        '=gateway=VPN-WG-MGMT',
        `=routing-table=${vrfName}`,
        '=scope=30', '=target-scope=10',
        `=comment=Route-${ndComment}-MGMT`]);
      steps.push({ step: '7b', obj: 'Ruta retorno MGMT', name: `VPN-WG-MGMT en ${vrfName}`, status: 'ok' });

      // Paso 7c — Address List LIST-NET-REMOTE-TOWERS (LANs + Red WG)
      const redWG = `${blockNetwork}/30`;
      for (const subnet of [...allSubnets, redWG]) {
        await writeIdempotent(api, ['/ip/firewall/address-list/add',
          '=list=LIST-NET-REMOTE-TOWERS', `=address=${subnet}`, `=comment=Ruta ${nameUpper}`]);
      }
      steps.push({ step: '7c', obj: 'Address List (LIST-NET-REMOTE-TOWERS)', name: [...allSubnets, redWG].join(', '), status: 'ok' });

      await api.close();

      // MySQL
      try {
        const db = await getDb();
        await db.run('BEGIN');
        try {
          await saveNode({
            ppp_user: ifaceName, nombre_nodo: nameUpper, nombre_vrf: vrfName,
            iface_name: ifaceName, node_number: nodeNumber, lan_subnets: allSubnets,
            segmento_lan: allSubnets[0] || '', ip_tunnel: wgPeerIP, protocol: 'wireguard',
            workspace_id: req.account?.workspace_id || null,
          });
          await db.run('COMMIT');
        } catch (txErr) { await db.run('ROLLBACK'); throw txErr; }
      } catch (dbErr) { log.error({ err: dbErr.message }, 'DB: guardar nodo WG'); }

      return sendOk(res, {
        message: `Nodo WG ND${ndNum} provisionado correctamente`,
        ifaceName, vrfName, remoteAddress: wgPeerIP,
        steps, serverPublicKey, wgPort, peerIP: wgPeerIP,
      });
    } else {
      // Paso 1 — PPP Secret
      await writeIdempotent(api, ['/ppp/secret/add',
        `=name=${pppUser}`, `=password=${pppPassword}`,
        '=service=sstp', '=profile=PROF-VPN-TOWERS',
        `=remote-address=${remoteAddress}`, `=comment=${ndComment}`]);
      steps.push({ step: 1, obj: 'PPP Secret', name: pppUser, status: 'ok' });

      // Paso 2 — Interfaz SSTP
      await writeIdempotent(api, ['/interface/sstp-server/add',
        `=name=${ifaceName}`, `=user=${pppUser}`]);
      steps.push({ step: 2, obj: 'SSTP Interface', name: ifaceName, status: 'ok' });
    }

    // Paso 3 — Agregar a LIST-VPN-TOWERS y LIST-VPN-SSTP
    await writeIdempotent(api, ['/interface/list/member/add',
      `=interface=${ifaceName}`, '=list=LIST-VPN-TOWERS']);
    await writeIdempotent(api, ['/interface/list/member/add',
      `=interface=${ifaceName}`, '=list=LIST-VPN-SSTP']);
    steps.push({ step: 3, obj: 'Interface Lists (LIST-VPN-TOWERS + LIST-VPN-SSTP)', name: ifaceName, status: 'ok' });

    // Paso 4 — Address List LIST-NET-REMOTE-TOWERS (una entrada por subred)
    const subnets = Array.isArray(lanSubnets) ? lanSubnets : [lanSubnet].filter(Boolean);
    for (const subnet of subnets) {
      await writeIdempotent(api, ['/ip/firewall/address-list/add',
        '=list=LIST-NET-REMOTE-TOWERS', `=address=${subnet}`, `=comment=LAN ${nameUpper}`]);
    }
    steps.push({ step: 4, obj: 'Address List (LIST-NET-REMOTE-TOWERS)', name: subnets.join(', '), status: 'ok' });

    // Paso 5 — VRF (con la interfaz SSTP asignada)
    await writeIdempotent(api, ['/ip/vrf/add',
      `=name=${vrfName}`, `=interfaces=${ifaceName}`]);
    steps.push({ step: 5, obj: 'VRF', name: vrfName, status: 'ok' });

    // RouterOS necesita un momento para registrar la routing-table del VRF recién creado
    await new Promise(r => setTimeout(r, 800));

    // Paso 6a — Ruta hacia cada LAN remota del nodo (gateway = interfaz@VRF)
    for (const subnet of subnets) {
      await writeIdempotent(api, ['/ip/route/add',
        `=dst-address=${subnet}`,
        `=gateway=${ifaceName}@${vrfName}`,
        `=routing-table=${vrfName}`,
        '=scope=30', '=target-scope=10',
        `=comment=Route-${ndComment}`]);
    }
    steps.push({ step: '6a', obj: 'Ruta(s) LAN remota', name: subnets.join(', '), status: 'ok' });

    // Paso 6b — Ruta de retorno hacia red de gestión WireGuard (en tabla VRF)
    await writeIdempotent(api, ['/ip/route/add',
      '=dst-address=192.168.21.0/24',
      '=gateway=VPN-WG-MGMT',
      `=routing-table=${vrfName}`,
      '=scope=30', '=target-scope=10',
      `=comment=Route-${ndComment}-MGMT`]);
    steps.push({ step: '6b', obj: 'Ruta retorno MGMT (192.168.21.0/24)', name: `VPN-WG-MGMT en ${vrfName}`, status: 'ok' });

    await api.close();

    // --- Persistir nodo + credenciales en MySQL (transacción atómica) ---
    try {
      const db = await getDb();
      const nodeId = isWG ? ifaceName : pppUser;

      await db.run('BEGIN');
      try {
        await saveNode({
          ppp_user: nodeId,
          nombre_nodo: nameUpper,
          nombre_vrf: vrfName,
          iface_name: ifaceName,
          node_number: nodeNumber,
          lan_subnets: allSubnets,
          segmento_lan: allSubnets[0] || '',
          ip_tunnel: remoteAddress,
          protocol: isWG ? 'wireguard' : 'sstp',
          workspace_id: req.account?.workspace_id || null,
        });

        if (!isWG) {
          const encrypted = encryptPass(pppPassword);
          await db.run(
            'UPDATE nodes SET ppp_password_enc = ? WHERE ppp_user = ?',
            [encrypted, pppUser]
          );
        }

        await db.run('COMMIT');
        log.debug({ nodeId, proto: isWG ? 'WG' : 'SSTP' }, 'DB: nodo guardado en MySQL');
      } catch (txErr) {
        await db.run('ROLLBACK');
        throw txErr;
      }
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: guardar nodo en MySQL');
    }

    return sendOk(res, {
      message: `Nodo ND${nodeNumber} provisionado correctamente`,
      ifaceName, vrfName, remoteAddress, steps,
      protocol, wgPort, serverPublicKey,
      peerIP: isWG ? wgPeerIP : undefined,
      listenPort: isWG ? wgPort : undefined,
    });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(
      getErrorMessage(error, ip, user),
      500, 'MIKROTIK_ERROR',
      { steps, failedAt: steps.length + 1 }
    );
  }
}));

router.post('/node/deprovision', asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { vrfName, pppUser, protocol } = req.body;
  if (!pppUser) throw new AppError('pppUser es requerido', 400, 'VALIDATION_ERROR');
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }

  const isWireGuard = protocol === 'wireguard' || pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');
  const hasVrf = !!vrfName;
  // Para WG: ifaceName === pppUser (ej. "WG-ND4-TORREVICTORN2")
  // Para SSTP: ifaceName se deriva del VRF (ej. "VPN-SSTP-ND1-HOUSENET")
  const ifaceName = isWireGuard ? pppUser : (hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '');

  const steps = []; let api;
  try {
    // ── CONEXIÓN 1: Leer TODOS los datos SECUENCIALMENTE ──────────────────────
    // RouterOS (node-routeros) es protocolo secuencial: comandos concurrentes en
    // la misma conexión causan "expected !re or !done" y corrupción. Leemos uno
    // por uno con timeouts cortos (6s). Worst-case 10×6s=60s (suficiente margen),
    // caso típico ~3-8s total porque /print sin filtro responde inmediato.
    const apiRead = await connectToMikrotik(ip, user, pass);
    const safeRead = (cmd) =>
      safeWrite(apiRead, [cmd], 6000).catch(e => {
        log.warn({ cmd, err: e?.message }, 'DEPROVISION read falló');
        return [];
      });

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

    // Cerramos apiRead antes de abrir la conexión de escritura para que no haya
    // api.write() pendientes (por !empty) que contaminen los removes posteriores.
    await apiRead.close().catch(() => {});

    // ── CONEXIÓN 2: Removes secuenciales en conexión limpia ───────────────────
    api = await connectToMikrotik(ip, user, pass);
    const silentRemove = (cmd, id) =>
      safeWrite(api, [cmd, `=.id=${id}`], 10000).catch(e =>
        log.warn({ cmd, id, err: e?.message }, 'DEPROVISION ignorado')
      );

    // ── Paso 1: Reglas Mangle (new-routing-mark === vrfName) ─────────────────
    if (hasVrf) {
      const mangleMatch = mangle.filter(m => m['new-routing-mark'] === vrfName && m['.id']);
      for (const m of mangleMatch) await silentRemove('/ip/firewall/mangle/remove', m['.id']);
      steps.push({ step: 1, obj: 'Reglas Mangle', name: `${mangleMatch.length} eliminadas`, status: 'ok' });
    }

    if (isWireGuard) {
      // ── Flujo WireGuard ───────────────────────────────────────────────────

      // Paso 2: Peers WG (buscar por interface === ifaceName)
      const peersToRemove = wgPeers.filter(p => p.interface === ifaceName && p['.id']);
      for (const p of peersToRemove) await silentRemove('/interface/wireguard/peers/remove', p['.id']);
      steps.push({ step: 2, obj: 'WG Peers', name: `${peersToRemove.length} peer(s)`, status: 'ok' });

      // Paso 3: IP address de la interface WG
      const wgAddrs = addrs.filter(a => a.interface === ifaceName && a['.id']);
      for (const a of wgAddrs) await silentRemove('/ip/address/remove', a['.id']);
      steps.push({ step: 3, obj: 'WG IP Address', name: `${wgAddrs.length} IP(s)`, status: 'ok' });

      // Paso 4: Interface WireGuard
      const wgIface = wgIfaces.find(i => i.name === ifaceName);
      if (wgIface) await silentRemove('/interface/wireguard/remove', wgIface['.id']);
      steps.push({ step: 4, obj: 'WG Interface', name: ifaceName, status: 'ok' });

      if (hasVrf) {
        // Paso 5: Interface Lists — LIST-VPN-TOWERS + LIST-VPN-WG
        let membersRemoved = 0;
        for (const list of ['LIST-VPN-TOWERS', 'LIST-VPN-WG']) {
          const entry = members.find(m => m.interface === ifaceName && m.list === list);
          if (entry) { await silentRemove('/interface/list/member/remove', entry['.id']); membersRemoved++; }
        }
        steps.push({ step: 5, obj: 'Interface Lists (TOWERS + WG)', name: `${membersRemoved} entradas`, status: 'ok' });
      }

    } else {
      // ── Flujo SSTP ────────────────────────────────────────────────────────

      // Paso 2: Desconectar sesión PPP activa (evita que RouterOS rechace el remove del secret)
      const activeSession = actives.find(a => a.name === pppUser);
      if (activeSession) await silentRemove('/ppp/active/remove', activeSession['.id']);
      steps.push({ step: 2, obj: 'Sesión PPP Activa', name: activeSession ? `desconectada (${pppUser})` : 'sin sesión activa', status: 'ok' });

      // Paso 3: PPP Secret
      const secret = secrets.find(s => s.name === pppUser);
      if (secret) await silentRemove('/ppp/secret/remove', secret['.id']);
      steps.push({ step: 3, obj: 'PPP Secret', name: pppUser, status: 'ok' });

      if (hasVrf) {
        // Paso 4: SSTP Interface — buscar primero por user (más robusto), fallback por name
        const iface = sstpIfaces.find(i => i.user === pppUser)
                   || sstpIfaces.find(i => i.name === ifaceName);
        if (iface) await silentRemove('/interface/sstp-server/remove', iface['.id']);
        steps.push({ step: 4, obj: 'SSTP Interface', name: ifaceName, status: 'ok' });

        // Paso 5: Interface Lists — LIST-VPN-TOWERS + LIST-VPN-SSTP
        let membersRemoved = 0;
        for (const list of ['LIST-VPN-TOWERS', 'LIST-VPN-SSTP']) {
          const entry = members.find(m => m.interface === ifaceName && m.list === list);
          if (entry) { await silentRemove('/interface/list/member/remove', entry['.id']); membersRemoved++; }
        }
        steps.push({ step: 5, obj: 'Interface Lists (TOWERS + SSTP)', name: `${membersRemoved} entradas`, status: 'ok' });
      }
    }

    if (hasVrf) {
      // Paso 6: Rutas — eliminar TODAS las de esta routing-table (ida LAN + vuelta MGMT)
      // Hay exactamente 1 VRF por nodo → se eliminan todas las rutas estáticas del VRF
      const vrfRoutes = routes.filter(r =>
        r['routing-table'] === vrfName && r.dynamic !== 'true' && r['.id']
      );
      for (const r of vrfRoutes) await silentRemove('/ip/route/remove', r['.id']);
      steps.push({ step: 6, obj: 'Rutas VRF (ida + vuelta)', name: `${vrfRoutes.length} rutas eliminadas`, status: 'ok' });

      // Paso 7: VRF — 1 VRF por nodo, se elimina completo
      const vrf = vrfs.find(v => v.name === vrfName);
      if (vrf) await silentRemove('/ip/vrf/remove', vrf['.id']);
      steps.push({ step: 7, obj: 'VRF', name: vrf ? `${vrfName} eliminado` : 'no encontrado (ya eliminado)', status: 'ok' });
    }

    await api.close();

    // Paso 8: cascade en BD (nodes, aps, cpes, signal_history, node_*)
    let deletedDeviceIds = [];
    try {
      const result = await deleteNode(pppUser);
      deletedDeviceIds = result?.deviceIds || [];
      steps.push({ step: 8, obj: 'Base de datos', name: `${deletedDeviceIds.length} APs + cascadas eliminados`, status: 'ok' });
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: eliminar nodo de la BD');
      steps.push({ step: 8, obj: 'Base de datos', name: `Error: ${dbErr.message}`, status: 'warn' });
    }

    return sendOk(res, { message: `Nodo eliminado correctamente`, steps, deletedDeviceIds });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(
      getErrorMessage(error, ip, user),
      500, 'MIKROTIK_ERROR',
      { steps, failedAt: steps.length + 1 }
    );
  }
}));

module.exports = router;
