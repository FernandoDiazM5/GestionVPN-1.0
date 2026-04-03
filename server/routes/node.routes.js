const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules, writeIdempotent, parseHandshakeSecs } = require('../routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, saveNode, getNodes, deleteNode } = require('../db.service');

router.post('/nodes', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const [secrets, wgIfaces, wgPeers, vrfs, active, sstpIfaces, routes] = await Promise.all([
            safeWrite(api, ['/ppp/secret/print']),
            safeWrite(api, ['/interface/wireguard/print']).catch(() => []),
            safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []),
            safeWrite(api, ['/ip/vrf/print']),
            safeWrite(api, ['/ppp/active/print']),
            safeWrite(api, ['/interface/sstp-server/print']),
            safeWrite(api, ['/ip/route/print']),
        ]);
        await api.close();

        const vrfByInterface = {}; vrfs.forEach(vrf => (vrf.interfaces || '').split(',').forEach(i => { if (i.trim()) vrfByInterface[i.trim()] = vrf.name; }));
        const sstpIfaceByUser = {}; sstpIfaces.forEach(i => { if (i.user && i.name) sstpIfaceByUser[i.user] = i.name; });
        const activeByName = {}; active.forEach(s => { if (s.name) activeByName[s.name] = { address: s.address, uptime: s.uptime }; });
        const sysRoutesByVrf = {}; (routes || []).forEach(r => { if (r['routing-table'] && r['routing-table'] !== 'main' && !r['dst-address']?.endsWith('/32') && r['dst-address'] !== '192.168.21.0/24' && r.dynamic !== 'true') { if (!sysRoutesByVrf[r['routing-table']]) sysRoutesByVrf[r['routing-table']] = []; sysRoutesByVrf[r['routing-table']].push(r['dst-address']); } });

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
                r['dst-address'] !== '192.168.21.0/24' &&
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

        // --- Merge etiquetas personalizadas desde SQLite (tienen prioridad sobre el comment de MikroTik) ---
        try {
            const db = await getDb();
            const labelRows = await db.all('SELECT ppp_user, label FROM node_labels');
            const labelMap = {};
            labelRows.forEach(r => { if (r.label) labelMap[r.ppp_user] = r.label; });
            nodes = nodes.map(n => labelMap[n.ppp_user] ? { ...n, nombre_nodo: labelMap[n.ppp_user] } : n);
        } catch (dbErr) {
            console.error('[DB] Error merging labels:', dbErr.message);
        }

        // --- Actualizar caché SQLite con el estado actual de MikroTik ---
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
            console.error('[DB] Error actualizando caché de nodos:', dbErr.message);
        }

        res.json(nodes);
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }

        // --- Fallback: retornar nodos desde caché SQLite si MikroTik no responde ---
        try {
            const cached = await getNodes();
            if (cached.length > 0) {
                console.warn('[DB] MikroTik no disponible — sirviendo nodos desde caché SQLite');
                const offlineNodes = cached.map(n => ({
                    ...n,
                    running: false,
                    uptime: '',
                    ip_tunnel: n.ip_tunnel || '',
                    cached: true,   // flag para el frontend
                }));
                return res.json(offlineNodes);
            }
        } catch (dbErr) {
            console.error('[DB] Error leyendo caché de nodos:', dbErr.message);
        }

        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/node/next', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const [vrfs, secrets] = await Promise.all([
            safeWrite(api, ['/ip/vrf/print']),
            safeWrite(api, ['/ppp/secret/print']),
        ]);
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

        res.json({ success: true, nextNode, nextRemote });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/node/provision', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { nodeNumber, nodeName, pppUser, pppPassword, lanSubnet, lanSubnets, remoteAddress, protocol, cpePublicKey, wgListenPort } = req.body;
    const isWG = protocol === 'wireguard';
    const allSubnets = Array.isArray(lanSubnets) && lanSubnets.length > 0 ? lanSubnets : [lanSubnet].filter(Boolean);
    if (allSubnets.length === 0 || !allSubnets.every(s => CIDR_REGEX.test(s)))
        return res.status(400).json({ success: false, message: 'CIDRs de LAN inválidos' });
    if (!isWG && !IPV4_REGEX.test(remoteAddress))
        return res.status(400).json({ success: false, message: 'IP remota inválida' });
    // cpePublicKey es opcional en WireGuard — el peer se agrega después si no se proporcionó
    if (!isWG && (!pppUser || !pppPassword)) return res.status(400).json({ success: false, message: 'Usuario y Contraseña requeridos para SSTP' });

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

            // SQLite
            try {
                const db = await getDb();
                await db.run('BEGIN');
                try {
                    await saveNode({
                        ppp_user: ifaceName, nombre_nodo: nameUpper, nombre_vrf: vrfName,
                        iface_name: ifaceName, node_number: nodeNumber, lan_subnets: allSubnets,
                        segmento_lan: allSubnets[0] || '', ip_tunnel: wgPeerIP, protocol: 'wireguard'
                    });
                    await db.run('COMMIT');
                } catch (txErr) { await db.run('ROLLBACK'); throw txErr; }
            } catch (dbErr) { console.error('[DB] Error guardando nodo WG:', dbErr.message); }

            return res.json({
                success: true,
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

        // Paso 3 — Agregar a LIST-VPN-TOWERS
        await writeIdempotent(api, ['/interface/list/member/add',
            `=interface=${ifaceName}`, '=list=LIST-VPN-TOWERS']);
        steps.push({ step: 3, obj: 'Interface List (LIST-VPN-TOWERS)', name: ifaceName, status: 'ok' });

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

        // --- Persistir nodo + credenciales en SQLite (transacción atómica) ---
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
                    protocol: isWG ? 'wireguard' : 'sstp'
                });

                if (!isWG) {
                    const encrypted = encryptPass(pppPassword);
                    await db.run(
                        'INSERT INTO node_creds (ppp_user, ppp_password) VALUES (?, ?) ON CONFLICT(ppp_user) DO UPDATE SET ppp_password = excluded.ppp_password',
                        [pppUser, encrypted]
                    );
                }

                await db.run('COMMIT');
                console.log(`[DB] Nodo guardado en SQLite: ${nodeId} (${isWG ? 'WG' : 'SSTP'})`);
            } catch (txErr) {
                await db.run('ROLLBACK');
                throw txErr;
            }
        } catch (dbErr) {
            console.error('[DB] Error guardando nodo en SQLite:', dbErr.message);
        }

        res.json({
            success: true,
            message: `Nodo ND${nodeNumber} provisionado correctamente`,
            ifaceName, vrfName, remoteAddress, steps,
            protocol, wgPort, serverPublicKey,
            peerIP: isWG ? wgPeerIP : undefined,
            listenPort: isWG ? wgPort : undefined,
        });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user), steps, failedAt: steps.length + 1 });
    }
});

router.post('/node/deprovision', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { vrfName, pppUser, protocol } = req.body;
    if (!pppUser)
        return res.status(400).json({ success: false, message: 'pppUser es requerido' });

    // Determinar protocolo: WG si el campo protocol lo dice, o si el nombre de interfaz es WG
    const isWireGuard = protocol === 'wireguard' || pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');
    const hasVrf = !!vrfName;
    // ifaceName: para WG === pppUser (el nombre de la interface WG); para SSTP se deriva del VRF
    const ifaceName = isWireGuard ? pppUser : (hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '');
    const steps = []; let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        if (hasVrf) {
            // Paso 1: Reglas Mangle (WEB-ACCESS) — eliminar solo las que marcan con new-routing-mark === vrfName
            // NO tocar vpn-activa — eso lo maneja cleanTunnelRules en tunnel/deactivate
            const mangle = await safeWrite(api, ['/ip/firewall/mangle/print']);
            const mangleMatch = mangle.filter(m => m['new-routing-mark'] === vrfName);
            for (const m of mangleMatch) await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${m['.id']}`]);
            steps.push({ step: 1, obj: 'Reglas Mangle (acceso VRF)', name: `${mangleMatch.length} eliminadas`, status: 'ok' });

            // Paso 2: Quitar interfaz de LIST-VPN-TOWERS y LIST-VPN-WG (si aplica)
            const members = await safeWrite(api, ['/interface/list/member/print']);
            const memberTowers = members.find(m => m.interface === ifaceName && m.list === 'LIST-VPN-TOWERS');
            if (memberTowers) await safeWrite(api, ['/interface/list/member/remove', `=.id=${memberTowers['.id']}`]);
            if (isWireGuard) {
                const memberWg = members.find(m => m.interface === ifaceName && m.list === 'LIST-VPN-WG');
                if (memberWg) await safeWrite(api, ['/interface/list/member/remove', `=.id=${memberWg['.id']}`]);
            }
            steps.push({ step: 2, obj: 'Interface List (LIST-VPN-TOWERS' + (isWireGuard ? ' + WG' : '') + ')', name: ifaceName, status: 'ok' });
        } else {
            steps.push({ step: '—', obj: 'Sin VRF configurado — se omiten pasos VRF', name: '', status: 'ok' });
        }

        if (isWireGuard) {
            // ── Flujo WireGuard ───────────────────────────────────────────────────

            // Paso 3: Eliminar peer(s) WireGuard asociados a esta interface
            const wgPeers = await safeWrite(api, ['/interface/wireguard/peers/print']).catch(() => []);
            const peersToRemove = wgPeers.filter(p => p.interface === ifaceName);
            for (const p of peersToRemove) {
                await safeWrite(api, ['/interface/wireguard/peers/remove', `=.id=${p['.id']}`]);
            }
            steps.push({ step: 3, obj: 'WG Peers', name: `${peersToRemove.length} peer(s) eliminados`, status: 'ok' });

            // Paso 4: Eliminar IP address de la interface WG
            const addrs = await safeWrite(api, ['/ip/address/print']).catch(() => []);
            const wgAddrs = addrs.filter(a => a.interface === ifaceName);
            for (const a of wgAddrs) {
                await safeWrite(api, ['/ip/address/remove', `=.id=${a['.id']}`]);
            }
            steps.push({ step: 4, obj: 'WG IP Address', name: `${wgAddrs.length} IP(s) eliminadas`, status: 'ok' });

            // Paso 5: Eliminar la interface WireGuard
            const wgIfaces = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
            const wgIface = wgIfaces.find(i => i.name === ifaceName);
            if (wgIface) await safeWrite(api, ['/interface/wireguard/remove', `=.id=${wgIface['.id']}`]);
            steps.push({ step: 5, obj: 'WG Interface', name: ifaceName, status: 'ok' });

            // Paso 5b: Firewall UDP — gestionado por regla global 13300-13400, no hay regla individual que eliminar
            steps.push({ step: '5b', obj: 'Firewall Filter UDP', name: 'regla global — sin acción', status: 'ok' });

        } else {
            // ── Flujo SSTP ────────────────────────────────────────────────────────

            // Paso 3: PPP Secret
            const secrets = await safeWrite(api, ['/ppp/secret/print']);
            const secret = secrets.find(s => s.name === pppUser);
            if (secret) await safeWrite(api, ['/ppp/secret/remove', `=.id=${secret['.id']}`]);
            steps.push({ step: 3, obj: 'PPP Secret', name: pppUser, status: 'ok' });

            if (hasVrf) {
                // Paso 4: Interfaz SSTP server
                const ifaces = await safeWrite(api, ['/interface/sstp-server/print']);
                const iface = ifaces.find(i => i.name === ifaceName);
                if (iface) await safeWrite(api, ['/interface/sstp-server/remove', `=.id=${iface['.id']}`]);
                steps.push({ step: 4, obj: 'SSTP Interface', name: ifaceName, status: 'ok' });
            }
        }

        if (hasVrf) {
            // Paso 5 (WG) / Paso 5 (SSTP): LIST-NET-REMOTE-TOWERS — NO TOCAR
            // Las subredes pueden ser compartidas entre múltiples nodos VPN

            // Paso 6: VRF
            const vrfs = await safeWrite(api, ['/ip/vrf/print']);
            const vrf = vrfs.find(v => v.name === vrfName);
            if (vrf) await safeWrite(api, ['/ip/vrf/remove', `=.id=${vrf['.id']}`]);
            steps.push({ step: 6, obj: 'VRF', name: vrfName, status: 'ok' });

            // Paso 7: Rutas del VRF (rutas LAN + ruta retorno MGMT)
            const routes = await safeWrite(api, ['/ip/route/print']);
            const vrfRoutes = routes.filter(r => r['routing-table'] === vrfName && r.dynamic !== 'true');
            let removedCount = 0;
            for (const r of vrfRoutes) {
                try {
                    await safeWrite(api, ['/ip/route/remove', `=.id=${r['.id']}`]);
                    removedCount++;
                } catch (e) { console.error('Error ignorado en delete de ruta:', e.message); }
            }
            steps.push({ step: 7, obj: 'Rutas VRF', name: `${removedCount} rutas eliminadas`, status: 'ok' });
        }

        await api.close();

        // Paso 8: SQLite cascade (labels, creds, tags, history, ssh_creds, devices, cpes)
        let deletedDeviceIds = [];
        try {
            const result = await deleteNode(pppUser);
            deletedDeviceIds = result?.deviceIds || [];
        } catch (dbErr) {
            console.error('[DB] Error eliminando nodo de SQLite:', dbErr.message);
        }

        res.json({ success: true, message: `Nodo eliminado correctamente`, steps, deletedDeviceIds });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user), steps, failedAt: steps.length + 1 });
    }
});

router.post('/node/details', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { vrfName, pppUser } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const [routes, addrList, secrets] = await Promise.all([
            vrfName ? safeWrite(api, ['/ip/route/print']) : Promise.resolve([]),
            vrfName ? safeWrite(api, ['/ip/firewall/address-list/print']) : Promise.resolve([]),
            pppUser ? safeWrite(api, ['/ppp/secret/print']) : Promise.resolve([]),
        ]);
        const vrfSubnets = routes
            .filter(r => r['routing-table'] === vrfName && r['dst-address'] !== '192.168.21.0/24')
            .map(r => r['dst-address']);
        const lanSubnets = addrList
            .filter(a => a.list === 'LIST-NET-REMOTE-TOWERS' && vrfSubnets.includes(a.address))
            .map(a => a.address);
        const secret = secrets.find(s => s.name === pppUser);
        const isWG = pppUser && (pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-'));

        const db = await getDb();
        const nodeRow = await db.get('SELECT data FROM nodes WHERE id = ?', [pppUser]);
        let ipTunnel = '';
        if (nodeRow && nodeRow.data) {
            try { ipTunnel = JSON.parse(nodeRow.data).ip_tunnel || ''; } catch (e) { }
        }

        await api.close();
        res.json({
            success: true,
            lanSubnets: lanSubnets.length > 0 ? lanSubnets : vrfSubnets,
            remoteAddress: isWG ? ipTunnel : (secret?.['remote-address'] || ipTunnel || ''),
            currentPppUser: isWG ? pppUser : (secret?.name || pppUser || ''),
            pppPassword: '********',   // Nunca enviar la contraseña real al frontend
        });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/node/edit', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { pppUser, newPppUser, newPassword, newRemoteAddress, newComment, vrfName, addSubnets, removeSubnets } = req.body;
    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    const isWG = pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');
    const hasVrf = !!vrfName;
    const ifaceName = isWG ? pppUser : (hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '');
    const ndMatch = vrfName?.match(/ND(\d+)/);
    const ndComment = ndMatch ? `ND${ndMatch[1]}` : (vrfName || '');
    const nameMatch = vrfName?.match(/VRF-ND\d+-(.+)/);
    const nameUpper = nameMatch ? nameMatch[1] : '';

    const steps = []; let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        if (!isWG) {
            // Cambios en el PPP Secret (user, password, remote-address, comment) — solo SSTP
            const secretChanges = [];
            if (newPassword) secretChanges.push(`=password=${newPassword}`);
            if (newRemoteAddress && IPV4_REGEX.test(newRemoteAddress)) secretChanges.push(`=remote-address=${newRemoteAddress}`);
            if (newPppUser && newPppUser !== pppUser) secretChanges.push(`=name=${newPppUser}`);
            if (newComment !== undefined && newComment !== null) secretChanges.push(`=comment=${newComment}`);

            if (secretChanges.length > 0) {
                const secrets = await safeWrite(api, ['/ppp/secret/print']);
                const secret = secrets.find(s => s.name === pppUser);
                if (secret) await safeWrite(api, ['/ppp/secret/set', `=.id=${secret['.id']}`, ...secretChanges]);

                const desc = [
                    newPppUser && newPppUser !== pppUser ? `usuario: ${pppUser}→${newPppUser}` : null,
                    newPassword ? 'contraseña actualizada' : null,
                    newRemoteAddress ? `IP túnel: ${newRemoteAddress}` : null,
                    newComment !== undefined && newComment !== null ? `etiqueta: ${newComment}` : null,
                ].filter(Boolean).join(', ');
                steps.push({ step: 1, obj: 'PPP Secret', name: desc, status: 'ok' });
            }

            // Si cambió el usuario PPP, también actualizar el binding SSTP
            if (newPppUser && newPppUser !== pppUser && hasVrf) {
                const ifaces = await safeWrite(api, ['/interface/sstp-server/print']);
                const iface = ifaces.find(i => i.name === ifaceName);
                if (iface) await safeWrite(api, ['/interface/sstp-server/set', `=.id=${iface['.id']}`, `=user=${newPppUser}`]);
                steps.push({ step: 2, obj: 'SSTP Interface (binding usuario)', name: `${ifaceName} → ${newPppUser}`, status: 'ok' });
            }
        }

        // Para WG: actualizar comment/etiqueta directamente en la interfaz WG
        if (isWG && newComment !== undefined && newComment !== null) {
            const wgIfaces = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
            const wgIface = wgIfaces.find(i => i.name === ifaceName);
            if (wgIface) await safeWrite(api, ['/interface/wireguard/set', `=.id=${wgIface['.id']}`, `=comment=${newComment}`]);
            steps.push({ step: 1, obj: 'WG Interface (etiqueta)', name: newComment, status: 'ok' });
        }

        // Actualizar label en SQLite (ambos protocolos)
        if (newComment !== undefined && newComment !== null) {
            try {
                const db = await getDb();
                await db.run('INSERT INTO node_labels (ppp_user, label) VALUES (?, ?) ON CONFLICT(ppp_user) DO UPDATE SET label = excluded.label', [pppUser, newComment]);
            } catch (e) {
                console.error('[DB] Error merging labels during edit:', e.message);
            }
        }

        // Eliminar subnets
        if (Array.isArray(removeSubnets) && removeSubnets.length > 0 && hasVrf) {
            const [addrList, routes] = await Promise.all([
                safeWrite(api, ['/ip/firewall/address-list/print']),
                safeWrite(api, ['/ip/route/print']),
            ]);
            for (const subnet of removeSubnets) {
                const entry = addrList.find(a => a.list === 'LIST-NET-REMOTE-TOWERS' && a.address === subnet);
                if (entry) await safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${entry['.id']}`]);
                const route = routes.find(r => r['routing-table'] === vrfName && r['dst-address'] === subnet);
                if (route) await safeWrite(api, ['/ip/route/remove', `=.id=${route['.id']}`]);
                steps.push({ step: 'rm', obj: 'Eliminar subred', name: subnet, status: 'ok' });
            }
        }

        // Agregar subnets
        if (Array.isArray(addSubnets) && addSubnets.length > 0 && hasVrf) {
            for (const subnet of addSubnets) {
                await writeIdempotent(api, ['/ip/firewall/address-list/add',
                    '=list=LIST-NET-REMOTE-TOWERS', `=address=${subnet}`, `=comment=LAN ${nameUpper}`]);
                await writeIdempotent(api, ['/ip/route/add',
                    `=dst-address=${subnet}`, `=gateway=${ifaceName}@${vrfName}`,
                    `=routing-table=${vrfName}`, '=scope=30', '=target-scope=10', `=comment=Route-${ndComment}`]);
                steps.push({ step: 'add', obj: 'Agregar subred', name: subnet, status: 'ok' });
            }
        }

        // Para WireGuard, si cambiaron las subredes, hay que actualizar el allowed-address del Peer
        let updatedLanSubnets = null;
        if (hasVrf && (Array.isArray(removeSubnets) && removeSubnets.length > 0) || (Array.isArray(addSubnets) && addSubnets.length > 0)) {
            const db = await getDb();
            const nodeRow = await db.get('SELECT data FROM nodes WHERE id = ?', [pppUser]);
            let currentSubnets = [];
            let wgPeerIp = '';
            let wgPubKey = '';
            if (nodeRow && nodeRow.data) {
                try {
                    const parsed = JSON.parse(nodeRow.data);
                    currentSubnets = parsed.lan_subnets || [];
                    if (parsed.ip_tunnel) {
                        const match = parsed.ip_tunnel.match(/10\.10\.251\.(\d+)/);
                        if (match) wgPeerIp = `10.10.251.${Math.floor(parseInt(match[1]) / 4) * 4 + 2}/32`;
                    }
                    wgPubKey = parsed.wg_public_key || parsed.cpePublicKey;
                } catch (e) { }
            }

            // Computar nueva lista de subredes
            let newSubnets = new Set(currentSubnets);
            (removeSubnets || []).forEach(s => newSubnets.delete(s));
            (addSubnets || []).forEach(s => newSubnets.add(s));
            updatedLanSubnets = Array.from(newSubnets);

            // Actualizar el peer de WireGuard si existe en MikroTik
            if (isWG && wgPubKey) {
                const wgPeers = await safeWrite(api, ['/interface/wireguard/peers/print']);
                const peer = wgPeers.find(p => p.interface === ifaceName && p['public-key'] === wgPubKey);
                if (peer) {
                    const allowedIps = wgPeerIp ? `${wgPeerIp},${updatedLanSubnets.join(',')}` : updatedLanSubnets.join(',');
                    await safeWrite(api, ['/interface/wireguard/peers/set', `=.id=${peer['.id']}`, `=allowed-address=${allowedIps}`]);
                    steps.push({ step: 'wg-peer', obj: 'WG Peer', name: 'allowed-address actualizado', status: 'ok' });
                }
            }
        }

        await api.close();
        if (steps.length === 0)
            return res.json({ success: false, message: 'Sin cambios para aplicar', steps });

        // --- Actualizar nodo en SQLite ---
        try {
            const effectiveUser = (newPppUser && newPppUser !== pppUser) ? newPppUser : pppUser;
            const updates = { ppp_user: effectiveUser };
            if (newComment !== undefined && newComment !== null) updates.nombre_nodo = newComment;
            if (newRemoteAddress) updates.ip_tunnel = newRemoteAddress;
            if (updatedLanSubnets !== null) {
                updates.lan_subnets = updatedLanSubnets;
                updates.segmento_lan = updatedLanSubnets[0] || '';
            }
            if (newPppUser && newPppUser !== pppUser) {
                // Usuario cambió: eliminar registro viejo y crear uno nuevo
                await deleteNode(pppUser);
            }
            await saveNode(updates);
            console.log(`[DB] Nodo actualizado en SQLite: ${effectiveUser}`);
        } catch (dbErr) {
            console.error('[DB] Error actualizando nodo en SQLite:', dbErr.message);
        }

        res.json({ success: true, message: 'Nodo actualizado correctamente', steps });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user), steps, failedAt: steps.length + 1 });
    }
});

router.post('/node/script', async (req, res) => {
    const { pppUser, pppPassword, serverPublicIP } = req.body;
    if (!pppUser || !serverPublicIP)
        return res.status(400).json({ success: false, message: 'pppUser y serverPublicIP son requeridos' });
    
    const isWG = pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');

    if (isWG) {
        let ipTunnel = '';
        let serverPublicKey = '<CLAVE_PUBLICA_SERVIDOR>';
        let wgPort = 13300;
        let wgNodeNum = 0;

        try {
            const db = await getDb();
            const nodeRow = await db.get('SELECT data FROM nodes WHERE id = ?', [pppUser]);
            if (nodeRow && nodeRow.data) {
                const parsed = JSON.parse(nodeRow.data);
                ipTunnel = parsed.ip_tunnel || '';
                wgNodeNum = parsed.node_number || parseInt(pppUser.match(/ND(\d+)/)?.[1] || '0');
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
        } catch(e) {}

        const peerOct = parseInt((ipTunnel || '10.10.251.2').split('.')[3] ?? '2');
        const blockBase30 = peerOct - 2;
        const tunnelNet30 = `10.10.251.${blockBase30}/30`;

        const script = `/interface wireguard add name=WG-CORE-ISP mtu=1420 comment="Conexion al Servidor Core"
/ip address add address=${ipTunnel || `10.10.251.${wgNodeNum * 4 - 2}`}/30 interface=WG-CORE-ISP network=10.10.251.${blockBase30} comment="IP WG Cliente ND${wgNodeNum}"
/interface wireguard peers add interface=WG-CORE-ISP public-key="${serverPublicKey}" endpoint-address=${serverPublicIP} endpoint-port=${wgPort} allowed-address=192.168.21.0/24,${tunnelNet30} persistent-keepalive=25s comment="Conexion al Servidor Core"
/ip route add dst-address=192.168.21.0/24 distance=2 gateway=WG-CORE-ISP comment="Retorno hacia Administracion/Software"
`;
        const cpeSteps = [
            { title: 'Crear interfaz WireGuard', cmd: `/interface wireguard add name=WG-CORE-ISP mtu=1420 comment="Conexion al Servidor Core"` },
            { title: 'Asignar IP al túnel (/30)', cmd: `/ip address add address=${ipTunnel || `10.10.251.${wgNodeNum * 4 - 2}`}/30 interface=WG-CORE-ISP network=10.10.251.${blockBase30} comment="IP WG Cliente ND${wgNodeNum}"` },
            { title: 'Agregar peer (servidor Core)', cmd: `/interface wireguard peers add interface=WG-CORE-ISP public-key="${serverPublicKey}" endpoint-address=${serverPublicIP} endpoint-port=${wgPort} allowed-address=192.168.21.0/24,${tunnelNet30} persistent-keepalive=25s comment="Conexion al Servidor Core"` },
            { title: 'Ruta de retorno hacia administración', cmd: `/ip route add dst-address=192.168.21.0/24 distance=2 gateway=WG-CORE-ISP comment="Retorno hacia Administracion/Software"` }
        ];
        return res.json({ success: true, script, cpeSteps });
    }

    if (!pppPassword) return res.status(400).json({ success: false, message: 'pppPassword es requerido para SSTP' });
    // Si sstp-out1 ya existe, solo actualiza sus parámetros (evita crear interfaz dinámica duplicada DR).
    // Si no existe, la crea desde cero.
    const script = `/interface sstp-client
:if ([find name=sstp-out1] = "") do={
  add authentication=mschap2 connect-to=${serverPublicIP} disabled=no http-proxy=0.0.0.0 name=sstp-out1 profile=default-encryption tls-version=only-1.2 user=${pppUser} password=${pppPassword}
} else={
  set [find name=sstp-out1] connect-to=${serverPublicIP} disabled=no user=${pppUser} password=${pppPassword}
}`;
    const cpeSteps = [
        { title: 'Configurar Cliente SSTP', cmd: `/interface sstp-client\n:if ([find name=sstp-out1] = "") do={\n  add authentication=mschap2 connect-to=${serverPublicIP} disabled=no http-proxy=0.0.0.0 name=sstp-out1 profile=default-encryption tls-version=only-1.2 user=${pppUser} password=${pppPassword}\n} else={\n  set [find name=sstp-out1] connect-to=${serverPublicIP} disabled=no user=${pppUser} password=${pppPassword}\n}` }
    ];
    res.json({ success: true, script, cpeSteps });
});

router.post('/node/label/save', async (req, res) => {
    const { pppUser, label } = req.body;
    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    try {
        const db = await getDb();
        await db.run('INSERT INTO node_labels (ppp_user, label) VALUES (?, ?) ON CONFLICT(ppp_user) DO UPDATE SET label = excluded.label',
            [pppUser, label || '']);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/node/scan-stream', async (req, res) => {
    const { nodeLan } = req.body;
    if (!nodeLan || !CIDR_REGEX.test(nodeLan) || parseInt(nodeLan.split('/')[1], 10) < 16) {
        return res.status(400).json({ success: false, message: 'CIDR inválido o muy grande' });
    }

    // SSE-like streaming over fetch
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const hostIPs = getSubnetHosts(nodeLan);
    const totalCount = hostIPs.length;

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('start', { total: totalCount });

    // Instanciar el hilo (Worker)
    const worker = new Worker(path.resolve(__dirname, '..', 'scanner.worker.js'), {
        workerData: { hostIPs, BATCH: 40 }
    });

    worker.on('message', (msg) => {
        if (msg.type === 'progress') {
            sendEvent('progress', msg.data);
        } else if (msg.type === 'complete') {
            sendEvent('complete', msg.data);
            res.end();
        } else if (msg.type === 'error') {
            sendEvent('error', msg.data);
            res.end();
        }
    });

    worker.on('error', (error) => {
        sendEvent('error', { message: error.message });
        res.end();
    });

    worker.on('exit', (code) => {
        if (code !== 0 && code !== 1) {
            sendEvent('error', { message: `Worker finalizó con código ${code}` });
            res.end();
        }
    });

    // Abortar hilo si el cliente cierra la conexión HTTP
    req.on('close', () => {
        worker.terminate();
    });
});

router.post('/node/creds/save', async (req, res) => {
    const { pppUser, pppPassword } = req.body;
    if (!pppUser || !pppPassword) return res.status(400).json({ success: false, message: 'pppUser y pppPassword requeridos' });
    try {
        const db = await getDb();
        const encrypted = encryptPass(pppPassword);
        await db.run('INSERT INTO node_creds (ppp_user, ppp_password) VALUES (?, ?) ON CONFLICT(ppp_user) DO UPDATE SET ppp_password = excluded.ppp_password', [pppUser, encrypted]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/node/creds/get', async (req, res) => {
    const { pppUser } = req.body;
    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    try {
        const db = await getDb();
        const row = await db.get('SELECT ppp_password FROM node_creds WHERE ppp_user = ?', [pppUser]);
        if (!row) return res.json({ success: false, message: 'Sin credenciales guardadas' });
        res.json({ success: true, pppPassword: decryptPass(row.ppp_password) });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/node/ssh-creds/save', async (req, res) => {
    const { pppUser, creds } = req.body;
    if (!pppUser || !Array.isArray(creds)) return res.status(400).json({ success: false, message: 'pppUser y creds[] requeridos' });
    try {
        const db = await getDb();
        // Cifrar cada contraseña individualmente
        const encrypted = JSON.stringify(creds.map(c => ({ user: c.user || '', encPass: encryptPass(c.pass || '') })));
        await db.run(
            'INSERT INTO node_ssh_creds (ppp_user, ssh_creds) VALUES (?, ?) ON CONFLICT(ppp_user) DO UPDATE SET ssh_creds=excluded.ssh_creds',
            [pppUser, encrypted]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/node/ssh-creds/get', async (req, res) => {
    const { pppUser } = req.body;
    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    try {
        const db = await getDb();
        const row = await db.get('SELECT ssh_creds, ssh_user, ssh_pass FROM node_ssh_creds WHERE ppp_user = ?', [pppUser]);
        if (!row) return res.json({ success: true, creds: [] });
        // Leer desde ssh_creds (nuevo) o migrar desde ssh_user/ssh_pass (legado)
        let creds = [];
        if (row.ssh_creds && row.ssh_creds !== '[]') {
            const parsed = JSON.parse(row.ssh_creds);
            creds = parsed.map(c => ({ user: c.user, pass: decryptPass(c.encPass) }));
        } else if (row.ssh_user) {
            creds = [{ user: row.ssh_user, pass: decryptPass(row.ssh_pass) }];
        }
        res.json({ success: true, creds });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/node/tags', async (req, res) => {
    try {
        const db = await getDb();
        const rows = await db.all('SELECT ppp_user, tags FROM node_tags');
        const result = {};
        rows.forEach(r => { try { result[r.ppp_user] = JSON.parse(r.tags); } catch { result[r.ppp_user] = []; } });
        res.json({ success: true, tags: result });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/node/tag/save', async (req, res) => {
    const { pppUser, tags } = req.body;
    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    try {
        const db = await getDb();
        await db.run('INSERT INTO node_tags (ppp_user, tags) VALUES (?, ?) ON CONFLICT(ppp_user) DO UPDATE SET tags = excluded.tags',
            [pppUser, JSON.stringify(Array.isArray(tags) ? tags : [])]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/node/history/add', async (req, res) => {
    const { pppUser, event } = req.body;
    if (!pppUser || !event) return res.status(400).json({ success: false, message: 'pppUser y event requeridos' });
    try {
        const db = await getDb();
        await db.run('INSERT INTO node_history (ppp_user, event, timestamp) VALUES (?, ?, ?)',
            [pppUser, event, Date.now()]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/node/history/get', async (req, res) => {
    const { pppUser } = req.body;
    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    try {
        const db = await getDb();
        const rows = await db.all(
            'SELECT event, timestamp FROM node_history WHERE ppp_user = ? ORDER BY timestamp DESC LIMIT 200',
            [pppUser]);
        res.json({ success: true, history: rows });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /node/wg/set-peer — Agrega o actualiza el peer CPE en un nodo WireGuard existente
router.post('/node/wg/set-peer', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik primero.' });
    const { ip, user, pass } = req.mikrotik;
    const { pppUser, cpePublicKey } = req.body;
    if (!pppUser || !cpePublicKey) return res.status(400).json({ success: false, message: 'pppUser y cpePublicKey son requeridos' });

    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // Leer IPs de la interfaz WG para calcular peerIP
        const allAddrs = (await safeWrite(api, ['/ip/address/print'])) || [];
        const wgAddr = allAddrs.find(a => a.interface === pppUser && (a.address || '').startsWith('10.10.251.'));
        if (!wgAddr) {
            await api.close();
            return res.status(404).json({ success: false, message: `No se encontró IP WireGuard para ${pppUser}` });
        }
        // Server IP es .X en la dirección, peer IP es .X+1
        // Ej: address=10.10.251.1/30 → serverOct=1 → peerOct=2
        const serverOct = parseInt((wgAddr.address || '').split('/')[0].split('.')[3]);
        const peerOct = serverOct + 1;
        const peerIP = `10.10.251.${peerOct}`;

        // Obtener LAN subnets del nodo desde SQLite
        const db = await getDb();
        const nodeRow = await db.get('SELECT data, segmento_lan FROM nodes WHERE id = ?', [pppUser]);
        let lanSubnets = [];
        if (nodeRow) {
            try {
                const parsed = JSON.parse(nodeRow.data || '{}');
                lanSubnets = Array.isArray(parsed.lan_subnets) ? parsed.lan_subnets : [];
            } catch (_) { }
            if (lanSubnets.length === 0 && nodeRow.segmento_lan) lanSubnets = [nodeRow.segmento_lan];
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
        res.json({ success: true, message: `Peer CPE configurado: ${peerIP} + ${lanSubnets.join(', ')}`, peerIP, allowedAddress });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user, pass) });
    }
});

module.exports = router;
