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
const { CIDR_REGEX } = require('../../ubiquiti.service');
const { getDb, encryptPass, saveNode, deleteNode } = require('../../db.service');
const { nodeBelongsToRequester, requireOperator } = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { mikrotikAppError } = require('../../lib/mikrotikError');
const { requireMikrotik } = require('../../lib/routeGuards');
const mgmtNet = require('../../lib/mgmtNet');
const sse = require('../../lib/sse');
const { entriesToAdd } = require('../../lib/addressList');

// Opción C: el /24 de scan-IP del VPS (por defecto 10.11.252.0/24). Cada VRF
// necesita una ruta de retorno hacia ese /24, vía la interfaz del VPS (el
// origen del escaneo). Vacío = no se añade (escaneo legacy en dev local).
//   server/.env.production:  SCAN_RETURN_SUBNET=10.11.252.0/24
const SCAN_RETURN_SUBNET = (process.env.SCAN_RETURN_SUBNET || '').trim();

/** Añade la ruta de retorno del /24 de scan-IP a un VRF (idempotente). No-op si no está configurado. */
async function addScanReturnRoute(api, vrfName, ndComment) {
  if (!SCAN_RETURN_SUBNET) return;
  await writeIdempotent(api, ['/ip/route/add',
    `=dst-address=${SCAN_RETURN_SUBNET}`,
    `=gateway=${mgmtNet.vps.iface}`,
    `=routing-table=${vrfName}`,
    '=scope=30', '=target-scope=10',
    `=comment=Route-${ndComment}-SCAN`]);
}

/** Añade las rutas de retorno del plano de gestión (CLIENTES/ADMIN/VPS) a un VRF. */
async function addMgmtReturnRoutes(api, vrfName, ndComment) {
  for (const rt of mgmtNet.returnRoutes()) {
    await writeIdempotent(api, ['/ip/route/add',
      `=dst-address=${rt.subnet}`,
      `=gateway=${rt.gateway}`,
      `=routing-table=${vrfName}`,
      '=scope=30', '=target-scope=10',
      `=comment=Route-${ndComment}-${rt.tag}`]);
  }
}

/**
 * Añade direcciones a LIST-NET-REMOTE-TOWERS SIN duplicar (lee la lista una vez).
 * La lista es un test de pertenencia → con UNA entrada por dirección basta; varios
 * nodos pueden compartir LAN (la entrada la "posee" quien la añadió primero, por
 * comment). Devuelve las direcciones realmente añadidas.
 */
async function addTowerEntries(api, addresses, comment) {
  const existing = await safeWrite(api, ['/ip/firewall/address-list/print']).catch(() => []);
  const toAdd = entriesToAdd(existing, 'LIST-NET-REMOTE-TOWERS', addresses);
  for (const addr of toAdd) {
    await writeIdempotent(api, ['/ip/firewall/address-list/add',
      '=list=LIST-NET-REMOTE-TOWERS', `=address=${addr}`, `=comment=${comment}`]);
  }
  return toAdd;
}

// Calcula la asignación AUTORITATIVA (siguiente ND + IP remota libre) desde el
// estado VIVO del router. La comparten /node/next (preview) y /node/provision
// (commit) para que ambos usen exactamente la misma lógica: así, si el preview
// quedó obsoleto (modal abierto mucho rato u otra alta en paralelo), el commit
// recalcula y no colisiona en el número de nodo / IP remota (H3 — TOCTOU).
// Devuelve también el conjunto `usedNd` para que el commit pueda respetar el ND
// del cliente si aún está libre (preview fiel) o reasignar el siguiente.
async function computeNextAllocation(api) {
  // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
  const vrfs = await safeWrite(api, ['/ip/vrf/print']);

  // Números de nodo en uso (VRF-ND2-..., VRF-ND3-...)
  const usedNd = new Set(
    vrfs
      .map(v => { const m = (v.name || '').match(/ND(\d+)/i); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0)
  );
  const maxNd = usedNd.size > 0 ? Math.max(...usedNd) : 1;  // ND1 reservado (.1 del Core)
  const nextNode = Math.max(maxNd + 1, 2);                  // los nodos arrancan en ND2

  // En el modelo unificado la IP del nodo (= remote-address SSTP) se deriva del
  // número de nodo, no de un pool de transporte. `nextRemote` es solo preview.
  const nextRemote = mgmtNet.nodeMgmtIp(nextNode, false);

  return { nextNode, nextRemote, usedNd };
}

// H4 — Rollback best-effort de una provisión que falló a mitad de camino.
// Elimina SOLO los objetos que esta llamada creó, usando los nombres
// determinísticos del nodo. Se ejecuta en una conexión fresca y es 100%
// tolerante a fallos (un router caído simplemente no limpia nada).
//
// Seguridad: el VRF y sus rutas SOLO se borran si `vrfCreatedByUs` (no en el
// merge a un VRF de un nodo SSTP preexistente — ese VRF es ajeno/compartido).
async function rollbackProvision(creds, { isWG, ifaceName, vrfName, pppUser, allSubnets, vrfCreatedByUs, nameUpper }) {
  if (!ifaceName || !vrfName) return false;
  let api;
  try {
    api = await connectToMikrotik(creds.ip, creds.user, creds.pass);
    const read = (cmd) => safeWrite(api, [cmd], 6000).catch(() => []);
    const rm = (cmd, id) => safeWrite(api, [cmd, `=.id=${id}`], 8000).catch(() => {});

    const members = await read('/interface/list/member/print');

    if (isWG) {
      for (const p of (await read('/interface/wireguard/peers/print')).filter(p => p.interface === ifaceName && p['.id']))
        await rm('/interface/wireguard/peers/remove', p['.id']);
      for (const a of (await read('/ip/address/print')).filter(a => a.interface === ifaceName && a['.id']))
        await rm('/ip/address/remove', a['.id']);
      const wgI = (await read('/interface/wireguard/print')).find(i => i.name === ifaceName);
      if (wgI && wgI['.id']) await rm('/interface/wireguard/remove', wgI['.id']);
      for (const list of ['LIST-VPN-TOWERS', 'LIST-VPN-WG']) {
        const m = members.find(m => m.interface === ifaceName && m.list === list);
        if (m && m['.id']) await rm('/interface/list/member/remove', m['.id']);
      }
    } else {
      const sec = (await read('/ppp/secret/print')).find(s => s.name === pppUser);
      if (sec && sec['.id']) await rm('/ppp/secret/remove', sec['.id']);
      const si = (await read('/interface/sstp-server/print')).find(i => i.name === ifaceName || i.user === pppUser);
      if (si && si['.id']) await rm('/interface/sstp-server/remove', si['.id']);
      for (const list of ['LIST-VPN-TOWERS', 'LIST-VPN-SSTP']) {
        const m = members.find(m => m.interface === ifaceName && m.list === list);
        if (m && m['.id']) await rm('/interface/list/member/remove', m['.id']);
      }
    }

    // Address-list: SOLO las entradas que ESTE nodo creó (por comment), NUNCA una
    // LAN compartida que pertenece a otro nodo. Con el dedup, la entrada de una LAN
    // compartida la posee quien la añadió primero → borrar por dirección rompería
    // a ese otro nodo. Por eso se filtra por el comment del nodo en rollback.
    const ourComments = new Set([`Ruta ${nameUpper}`, `LAN ${nameUpper}`]);
    for (const a of (await read('/ip/firewall/address-list/print'))
      .filter(a => a.list === 'LIST-NET-REMOTE-TOWERS' && ourComments.has(a.comment) && a['.id']))
      await rm('/ip/firewall/address-list/remove', a['.id']);

    // VRF + rutas: SOLO si lo creamos nosotros (nunca en merge a VRF ajeno)
    if (vrfCreatedByUs) {
      for (const r of (await read('/ip/route/print'))
        .filter(r => r['routing-table'] === vrfName && r.dynamic !== 'true' && r['.id']))
        await rm('/ip/route/remove', r['.id']);
      const v = (await read('/ip/vrf/print')).find(v => v.name === vrfName);
      if (v && v['.id']) await rm('/ip/vrf/remove', v['.id']);
    }

    await api.close().catch(() => {});
    return true;
  } catch (_) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    return false;
  }
}

router.post('/node/next', requireOperator, asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const { nextNode, nextRemote } = await computeNextAllocation(api);
    await api.close();
    return sendOk(res, { nextNode, nextRemote });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw mikrotikAppError(error, ip, user);
  }
}));

router.post('/node/provision', requireOperator, asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { nodeNumber, nodeName, pppUser, pppPassword, lanSubnet, lanSubnets, remoteAddress, protocol, cpePublicKey, wgListenPort, provisionId } = req.body;
  const isWG = protocol === 'wireguard';
  const allSubnets = Array.isArray(lanSubnets) && lanSubnets.length > 0 ? lanSubnets : [lanSubnet].filter(Boolean);
  if (allSubnets.length === 0 || !allSubnets.every(s => CIDR_REGEX.test(s)))
    throw new AppError('CIDRs de LAN inválidos', 400, 'VALIDATION_ERROR');
  // La IP remota (SSTP) es server-authoritative: si no llega o es inválida, se
  // recalcula tras conectar. No se exige al cliente (cierra el caso preview obsoleto).
  // cpePublicKey es opcional en WireGuard — el peer se agrega después si no se proporcionó
  if (!isWG && (!pppUser || !pppPassword)) throw new AppError('Usuario y Contraseña requeridos para SSTP', 400, 'VALIDATION_ERROR');

  // H6 — validación de nombre server-side (evita VRF-ND…- sin nombre)
  const nameUpper = (nodeName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (nameUpper.length < 2)
    throw new AppError('Nombre de nodo inválido (mínimo 2 caracteres alfanuméricos)', 400, 'VALIDATION_ERROR');

  const steps = []; let api;
  // H10 — progreso real: cada paso completado se publica por SSE al room del
  // workspace; el frontend (con el mismo provisionId) avanza la barra con el
  // conteo real. `steps[steps.length]=s` en vez de `.push` para que el
  // replace_all global de la ruta no toque este helper. Nunca rompe el flujo.
  const wsId = req.account?.workspace_id || null;
  const pushStep = (s) => {
    steps[steps.length] = s;
    try { if (wsId && provisionId) sse.publish(wsId, 'node-provision', { provisionId, step: s }); } catch (_) { /* noop */ }
  };
  let wgPeerIP = '';
  let serverPublicKey = '';
  // Variables de scope externo: el catch las necesita para el rollback (H4).
  let ndNum, effectiveRemote, ifaceName, vrfName, ndComment, wgPort;
  // Solo eliminamos el VRF en rollback si LO CREAMOS nosotros (no en el merge a
  // un VRF de un nodo SSTP preexistente — ahí el VRF es ajeno y compartido).
  let vrfCreatedByUs = false;

  try {
    api = await connectToMikrotik(ip, user, pass);

    // H3 — Asignación AUTORITATIVA desde el estado vivo (cierra el TOCTOU del
    // preview). Se respeta el valor del cliente solo si sigue libre; si colisiona
    // (otra alta lo tomó, o el modal quedó obsoleto), se reasigna el siguiente.
    const alloc = await computeNextAllocation(api);
    const clientNd = parseInt(nodeNumber, 10);
    // ND1 reservado para el endpoint del Core (.1) → los nodos arrancan en ND2.
    ndNum = (Number.isInteger(clientNd) && clientNd >= 2 && !alloc.usedNd.has(clientNd))
      ? clientNd : alloc.nextNode;
    // WG usa nombre sin prefijo VPN-; SSTP mantiene prefijo VPN-SSTP-
    ifaceName = isWG ? `WG-ND${ndNum}-${nameUpper}` : `VPN-SSTP-ND${ndNum}-${nameUpper}`;
    vrfName = `VRF-ND${ndNum}-${nameUpper}`;
    ndComment = `ND${ndNum}`;
    // Puerto: 13300 + número de nodo (ej. ND2=13302, ND7=13307)
    wgPort = wgListenPort ? parseInt(wgListenPort, 10) : (13300 + ndNum);
    // IP ÚNICA del nodo (transporte + gestión): WG 10.11.250.<ND> / SSTP 10.11.251.<ND>.
    // Vive en el CPE; el Core la rutea al VRF y la marca en el mangle.
    const nodeMgmt = mgmtNet.nodeMgmtIp(ndNum, isWG);
    if (!nodeMgmt) throw new AppError(`Número de nodo inválido (ND${ndNum}); use ND ≥ 2 (ND1 reservado)`, 400, 'VALIDATION_ERROR');
    // SSTP: el remote-address ES la IP del nodo (determinístico, sin pool de transporte).
    effectiveRemote = isWG ? null : nodeMgmt;

    if (isWG) {
      // Modelo unificado: el nodo tiene UNA sola IP (transporte + gestión) =
      // 10.11.250.<ND>. La interfaz WG del Core NO lleva IP de transporte; el
      // tráfico se enruta por gateway=iface@VRF + allowed-address del peer.
      wgPeerIP = nodeMgmt;

      // Paso 1 — Interface WG (comment = nombre real del nodo para mostrarse en la UI)
      await writeIdempotent(api, ['/interface/wireguard/add',
        `=name=${ifaceName}`, `=listen-port=${wgPort}`, `=mtu=1420`, `=comment=${nodeName}`]);
      pushStep({ step: 1, obj: 'WG Interface', name: `${ifaceName} port=${wgPort}`, status: 'ok' });

      // Obtener Server Public Key
      const wgInfo = await safeWrite(api, ['/interface/wireguard/print', `?name=${ifaceName}`]);
      if (wgInfo && wgInfo.length > 0) serverPublicKey = wgInfo[0]['public-key'];

      // Paso 2 — (modelo unificado) sin IP de transporte en el Core
      pushStep({ step: 2, obj: 'WG IP', name: `sin IP de transporte (modelo unificado, túnel=${wgPeerIP})`, status: 'ok' });

      // Paso 3 — Peer WG (CPE) — solo si se proporcionó la clave pública del CPE
      const subnetsList = allSubnets.join(',');
      // allowed-address: la IP única del nodo (/32) + LAN(s) de la torre.
      const peerAllowed = [`${nodeMgmt}/32`, subnetsList].filter(Boolean).join(',');
      if (cpePublicKey) {
        await writeIdempotent(api, ['/interface/wireguard/peers/add',
          `=interface=${ifaceName}`, `=public-key=${cpePublicKey}`,
          `=allowed-address=${peerAllowed}`, `=comment=Cliente ${ndComment}`]);
        pushStep({ step: 3, obj: 'WG Peer', name: peerAllowed, status: 'ok' });
      } else {
        pushStep({ step: 3, obj: 'WG Peer', name: 'Omitido — sin clave CPE (agregar después)', status: 'ok' });
      }

      // Paso 4 — LIST-VPN-TOWERS (y LIST-VPN-WG para Wireguard)
      await writeIdempotent(api, ['/interface/list/member/add',
        `=interface=${ifaceName}`, '=list=LIST-VPN-TOWERS']);
      await writeIdempotent(api, ['/interface/list/member/add',
        `=interface=${ifaceName}`, '=list=LIST-VPN-WG']);
      pushStep({ step: 4, obj: 'Interface List (LIST-VPN-TOWERS & WG)', name: ifaceName, status: 'ok' });

      // Paso 5 — VRF: si ya existe (nodo SSTP previo), agregar interfaz WG; si no, crear
      // VRF: traer todos sin filtro (evita timeout con ?name=) y buscar en JS
      let allVrfs = [];
      try { allVrfs = (await safeWrite(api, ['/ip/vrf/print'])) || []; } catch (_) { allVrfs = []; }
      const existingVrfEntry = allVrfs.find(v => v.name === vrfName);
      vrfCreatedByUs = !existingVrfEntry;   // H4: solo borrable en rollback si lo creamos
      if (existingVrfEntry) {
        const currentIfaces = existingVrfEntry.interfaces || '';
        const ifaceAlreadyIn = currentIfaces.split(',').map(s => s.trim()).includes(ifaceName);
        if (!ifaceAlreadyIn) {
          const ifaceList = currentIfaces ? `${currentIfaces},${ifaceName}` : ifaceName;
          await safeWrite(api, ['/ip/vrf/set', `=numbers=${existingVrfEntry['.id']}`, `=interfaces=${ifaceList}`]);
        }
        pushStep({ step: 5, obj: 'VRF (WG agregada al VRF existente)', name: `${vrfName} ← ${ifaceName}`, status: 'ok' });
      } else {
        await safeWrite(api, ['/ip/vrf/add', `=name=${vrfName}`, `=interfaces=${ifaceName}`]);
        pushStep({ step: 5, obj: 'VRF', name: vrfName, status: 'ok' });
        await new Promise(r => setTimeout(r, 800));
      }

      // Paso 6 — Firewall: el rango 13300-13400 ya está cubierto por la regla global
      // "Permitir todos los tuneles WG Nodos" — no se crean reglas individuales por nodo
      pushStep({ step: 6, obj: 'Firewall UDP', name: `puerto ${wgPort} cubierto por regla global 13300-13400`, status: 'ok' });

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
      pushStep({ step: '7a', obj: 'Rutas LAN remota(s)', name: `${subnets.join(', ')} (distance=2)`, status: 'ok' });

      // Paso 7b — Rutas de retorno del plano de gestión (CLIENTES/ADMIN/VPS)
      await addMgmtReturnRoutes(api, vrfName, ndComment);
      pushStep({ step: '7b', obj: 'Rutas retorno MGMT', name: mgmtNet.returnRoutes().map(r => r.gateway).join(', '), status: 'ok' });

      // Paso 7b' — Ruta retorno scan-IP del VPS (Opción C)
      await addScanReturnRoute(api, vrfName, ndComment);

      // Paso 7b'' — IP de gestión del nodo: ruta /32 al túnel del CPE
      if (nodeMgmt) {
        await writeIdempotent(api, ['/ip/route/add',
          `=dst-address=${nodeMgmt}/32`,
          `=gateway=${ifaceName}@${vrfName}`,
          `=routing-table=${vrfName}`,
          '=scope=30', '=target-scope=10',
          `=comment=Route-${ndComment}-MGMTIP`]);
        pushStep({ step: '7b″', obj: 'IP gestión del nodo', name: `${nodeMgmt}/32 → ${ifaceName}`, status: 'ok' });
      }

      // Paso 7c — Address List LIST-NET-REMOTE-TOWERS (LANs + IP única del nodo), sin duplicar
      const towerEntries = [...allSubnets, `${nodeMgmt}/32`];
      const wgAdded = await addTowerEntries(api, towerEntries, `Ruta ${nameUpper}`);
      pushStep({ step: '7c', obj: 'Address List (LIST-NET-REMOTE-TOWERS)', name: `${wgAdded.length}/${towerEntries.length} nuevas (resto ya presente)`, status: 'ok' });

      await api.close();

      // MySQL
      try {
        const db = await getDb();
        await db.run('BEGIN');
        try {
          await saveNode({
            ppp_user: ifaceName, nombre_nodo: nameUpper, nombre_vrf: vrfName,
            iface_name: ifaceName, node_number: ndNum, lan_subnets: allSubnets,
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
        `=remote-address=${effectiveRemote}`, `=comment=${ndComment}`]);
      pushStep({ step: 1, obj: 'PPP Secret', name: pppUser, status: 'ok' });

      // Paso 2 — Interfaz SSTP
      await writeIdempotent(api, ['/interface/sstp-server/add',
        `=name=${ifaceName}`, `=user=${pppUser}`]);
      pushStep({ step: 2, obj: 'SSTP Interface', name: ifaceName, status: 'ok' });
    }

    // Paso 3 — Agregar a LIST-VPN-TOWERS y LIST-VPN-SSTP
    await writeIdempotent(api, ['/interface/list/member/add',
      `=interface=${ifaceName}`, '=list=LIST-VPN-TOWERS']);
    await writeIdempotent(api, ['/interface/list/member/add',
      `=interface=${ifaceName}`, '=list=LIST-VPN-SSTP']);
    pushStep({ step: 3, obj: 'Interface Lists (LIST-VPN-TOWERS + LIST-VPN-SSTP)', name: ifaceName, status: 'ok' });

    // Paso 4 — Address List LIST-NET-REMOTE-TOWERS (una entrada por subred), sin duplicar
    const subnets = Array.isArray(lanSubnets) ? lanSubnets : [lanSubnet].filter(Boolean);
    const sstpAdded = await addTowerEntries(api, subnets, `LAN ${nameUpper}`);
    pushStep({ step: 4, obj: 'Address List (LIST-NET-REMOTE-TOWERS)', name: `${sstpAdded.length}/${subnets.length} nuevas (resto ya presente)`, status: 'ok' });

    // Paso 5 — VRF (con la interfaz SSTP asignada). ND autoritativo-único ⇒ VRF nuevo.
    await writeIdempotent(api, ['/ip/vrf/add',
      `=name=${vrfName}`, `=interfaces=${ifaceName}`]);
    vrfCreatedByUs = true;   // H4: VRF creado por nosotros → borrable en rollback
    pushStep({ step: 5, obj: 'VRF', name: vrfName, status: 'ok' });

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
    pushStep({ step: '6a', obj: 'Ruta(s) LAN remota', name: subnets.join(', '), status: 'ok' });

    // Paso 6b — Rutas de retorno del plano de gestión (CLIENTES/ADMIN/VPS)
    await addMgmtReturnRoutes(api, vrfName, ndComment);
    pushStep({ step: '6b', obj: 'Rutas retorno MGMT', name: mgmtNet.returnRoutes().map(r => r.gateway).join(', '), status: 'ok' });

    // Paso 6b'' — IP de gestión del nodo (ruta /32 al túnel + address-list)
    if (nodeMgmt) {
      await writeIdempotent(api, ['/ip/route/add',
        `=dst-address=${nodeMgmt}/32`,
        `=gateway=${ifaceName}@${vrfName}`,
        `=routing-table=${vrfName}`,
        '=scope=30', '=target-scope=10',
        `=comment=Route-${ndComment}-MGMTIP`]);
      await addTowerEntries(api, [`${nodeMgmt}/32`], `Ruta ${nameUpper}`);
      pushStep({ step: '6b″', obj: 'IP gestión del nodo', name: `${nodeMgmt}/32 → ${ifaceName}`, status: 'ok' });
    }

    // Paso 6b' — Ruta retorno scan-IP del VPS (Opción C, si vive fuera de .21)
    await addScanReturnRoute(api, vrfName, ndComment);

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
          node_number: ndNum,
          lan_subnets: allSubnets,
          segmento_lan: allSubnets[0] || '',
          ip_tunnel: effectiveRemote,
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
      message: `Nodo ND${ndNum} provisionado correctamente`,
      ifaceName, vrfName, remoteAddress: effectiveRemote, steps,
      protocol, wgPort, serverPublicKey,
      peerIP: isWG ? wgPeerIP : undefined,
      listenPort: isWG ? wgPort : undefined,
    });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }

    // H4 — Rollback best-effort de lo creado (evita orfanatos en el router
    // compartido). Solo intentamos si llegamos a derivar los nombres del nodo.
    let rolledBack = false;
    if (ifaceName && vrfName) {
      rolledBack = await rollbackProvision({ ip, user, pass },
        { isWG, ifaceName, vrfName, pppUser, allSubnets, vrfCreatedByUs, nameUpper });
      log.warn({ ifaceName, vrfName, rolledBack, vrfCreatedByUs }, 'PROVISION falló — rollback ejecutado');
    }

    if (error instanceof AppError) throw error;
    throw new AppError(
      getErrorMessage(error, ip, user),
      500, 'MIKROTIK_ERROR',
      { steps, failedAt: steps.length + 1, rolledBack }
    );
  }
}));

router.post('/node/deprovision', requireOperator, asyncHandler(async (req, res) => {
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
  // pushStep local (sin SSE): deprovision no necesita progreso en vivo, pero
  // comparte el rename de `steps.push`→`pushStep` del replace_all de la ruta.
  const pushStep = (s) => { steps[steps.length] = s; };
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
      pushStep({ step: 1, obj: 'Reglas Mangle', name: `${mangleMatch.length} eliminadas`, status: 'ok' });
    }

    if (isWireGuard) {
      // ── Flujo WireGuard ───────────────────────────────────────────────────

      // Paso 2: Peers WG (buscar por interface === ifaceName)
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
      // ── Flujo SSTP ────────────────────────────────────────────────────────

      // Paso 2: Desconectar sesión PPP activa (evita que RouterOS rechace el remove del secret)
      const activeSession = actives.find(a => a.name === pppUser);
      if (activeSession) await silentRemove('/ppp/active/remove', activeSession['.id']);
      pushStep({ step: 2, obj: 'Sesión PPP Activa', name: activeSession ? `desconectada (${pppUser})` : 'sin sesión activa', status: 'ok' });

      // Paso 3: PPP Secret
      const secret = secrets.find(s => s.name === pppUser);
      if (secret) await silentRemove('/ppp/secret/remove', secret['.id']);
      pushStep({ step: 3, obj: 'PPP Secret', name: pppUser, status: 'ok' });

      if (hasVrf) {
        // Paso 4: SSTP Interface — buscar primero por user (más robusto), fallback por name
        const iface = sstpIfaces.find(i => i.user === pppUser)
                   || sstpIfaces.find(i => i.name === ifaceName);
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
      // Paso 6: Rutas — eliminar TODAS las de esta routing-table (ida LAN + vuelta MGMT)
      // Hay exactamente 1 VRF por nodo → se eliminan todas las rutas estáticas del VRF
      const vrfRoutes = routes.filter(r =>
        r['routing-table'] === vrfName && r.dynamic !== 'true' && r['.id']
      );
      for (const r of vrfRoutes) await silentRemove('/ip/route/remove', r['.id']);
      pushStep({ step: 6, obj: 'Rutas VRF (ida + vuelta)', name: `${vrfRoutes.length} rutas eliminadas`, status: 'ok' });

      // Paso 7: VRF — 1 VRF por nodo, se elimina completo
      const vrf = vrfs.find(v => v.name === vrfName);
      if (vrf) await silentRemove('/ip/vrf/remove', vrf['.id']);
      pushStep({ step: 7, obj: 'VRF', name: vrf ? `${vrfName} eliminado` : 'no encontrado (ya eliminado)', status: 'ok' });
    }

    await api.close();

    // Paso 8: cascade en BD (nodes, aps, cpes, signal_history, node_*)
    let deletedDeviceIds = [];
    try {
      const result = await deleteNode(pppUser);
      deletedDeviceIds = result?.deviceIds || [];
      pushStep({ step: 8, obj: 'Base de datos', name: `${deletedDeviceIds.length} APs + cascadas eliminados`, status: 'ok' });
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: eliminar nodo de la BD');
      pushStep({ step: 8, obj: 'Base de datos', name: `Error: ${dbErr.message}`, status: 'warn' });
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
