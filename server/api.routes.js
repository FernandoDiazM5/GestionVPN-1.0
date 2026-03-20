const express = require('express');
const router = express.Router();
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules } = require('./routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('./ubiquiti.service');
const { getDb, encryptDevice, decryptDevice, encryptPass, decryptPass } = require('./db.service');

router.post('/connect', async (req, res) => {
    const { ip, user, pass } = req.body;
    if (!ip || !user) return res.status(400).json({ success: false, message: 'Faltan credenciales' });
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const resource = await safeWrite(api, ['/system/resource/print']);
        await api.close();
        res.json({ success: true, message: 'Conectado exitosamente', data: resource });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/secrets', async (req, res) => {
    const { ip, user, pass } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const secrets = await safeWrite(api, ['/ppp/secret/print']);
        await api.close();
        res.json(secrets.map(item => ({ id: item['.id'], name: item.name || 'Unknown', service: item.service || 'any', profile: item.profile || 'default', disabled: item.disabled === 'true' || item.disabled === true, running: false })));
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: error.message || 'Error al obtener secretos del MikroTik' });
    }
});

router.post('/active', async (req, res) => {
    const { ip, user, pass } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const activeConnections = await safeWrite(api, ['/ppp/active/print']);
        await api.close();
        res.json(activeConnections.map(item => ({ name: item.name || 'Unknown', service: item.service || 'any', address: item.address || '', uptime: item.uptime || '' })));
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: error.message || 'Error al obtener conexiones activas' });
    }
});

router.post('/interface/activate', async (req, res) => {
    const { ip, user, pass, vpnName, vpnService } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const bindingMenu = `/interface/${vpnService}-server`;
        const allIfaces = await safeWrite(api, [`${bindingMenu}/print`]);
        const existingIface = allIfaces.find(i => i.user === vpnName);
        if (existingIface?.['.id']) {
            if (existingIface.disabled === 'true' || existingIface.disabled === true) await safeWrite(api, [`${bindingMenu}/enable`, `=.id=${existingIface['.id']}`]);
        } else {
            await safeWrite(api, [`${bindingMenu}/add`, `=name=${vpnService}-${vpnName}`, `=user=${vpnName}`]);
        }
        const allActive = await safeWrite(api, ['/ppp/active/print']);
        await api.close();
        res.json({ success: true, ip: allActive.find(s => s.name === vpnName)?.address });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: error.message || 'Error activando interface' });
    }
});

router.post('/interface/deactivate', async (req, res) => {
    const { ip, user, pass, vpnName, vpnService } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const bindingMenu = `/interface/${vpnService}-server`;
        const allIfaces = await safeWrite(api, [`${bindingMenu}/print`]);
        const existingIface = allIfaces.find(i => i.user === vpnName);
        if (existingIface?.['.id']) await safeWrite(api, [`${bindingMenu}/disable`, `=.id=${existingIface['.id']}`]);
        await api.close();
        res.json({ success: true });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: error.message || 'Error desactivando interface' });
    }
});

router.post('/nodes', async (req, res) => {
    const { ip, user, pass } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const [secrets, vrfs, active, sstpIfaces, routes] = await Promise.all([
            safeWrite(api, ['/ppp/secret/print']), safeWrite(api, ['/ip/vrf/print']), safeWrite(api, ['/ppp/active/print']),
            safeWrite(api, ['/interface/sstp-server/print']), safeWrite(api, ['/ip/route/print']),
        ]);
        await api.close();

        const vrfByInterface = {}; vrfs.forEach(vrf => (vrf.interfaces || '').split(',').forEach(i => { if (i.trim()) vrfByInterface[i.trim()] = vrf.name; }));
        const sstpIfaceByUser = {}; sstpIfaces.forEach(i => { if (i.user && i.name) sstpIfaceByUser[i.user] = i.name; });
        const activeByName = {}; active.forEach(s => { if (s.name) activeByName[s.name] = { address: s.address, uptime: s.uptime }; });
        const sysRoutesByVrf = {}; (routes || []).forEach(r => { if (r['routing-table'] && r['routing-table'] !== 'main' && !r['dst-address']?.endsWith('/32') && r['dst-address'] !== '192.168.21.0/24') { if (!sysRoutesByVrf[r['routing-table']]) sysRoutesByVrf[r['routing-table']] = []; sysRoutesByVrf[r['routing-table']].push(r['dst-address']); } });

        let nodes = secrets.filter(s => s.service === 'sstp').map(secret => {
            const name = secret.name || 'Unknown';
            const session = activeByName[name];
            const nombreVrf = vrfByInterface[sstpIfaceByUser[name] || ''] || '';
            return {
                id: secret['.id'], nombre_nodo: (secret.comment || name).replace(/Torre|torre|-ND\d+/gi, '').trim() || name,
                ppp_user: name, segmento_lan: secret.routes || (sysRoutesByVrf[nombreVrf]?.[0] || ''), lan_subnets: sysRoutesByVrf[nombreVrf] || [], nombre_vrf: nombreVrf,
                service: secret.service || 'sstp', disabled: secret.disabled === 'true' || secret.disabled === true,
                running: !!session, ip_tunnel: session ? session.address : '', uptime: session ? session.uptime : '',
            };
        });

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

        res.json(nodes);
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/tunnel/activate', async (req, res) => {
    const { ip, user, pass, tunnelIP, targetVRF } = req.body;
    if (!IPV4_REGEX.test(tunnelIP)) return res.status(400).json({ success: false, message: `tunnelIP inválida: "${tunnelIP}"` });
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        await cleanTunnelRules(api);
        try { await api.close(); } catch (_) { }
        api = await connectToMikrotik(ip, user, pass);
        await safeWrite(api, ['/ip/firewall/address-list/add', '=list=vpn-activa', `=address=${tunnelIP}`, '=comment=User Access']);
        await safeWrite(api, ['/ip/firewall/mangle/add', '=chain=prerouting', `=src-address=${tunnelIP}`, '=dst-address-list=LIST-NET-REMOTE-TOWERS', '=action=mark-routing', `=new-routing-mark=${targetVRF}`, '=passthrough=yes', '=comment=WEB-ACCESS']);
        await api.close();
        res.json({ success: true, message: `Acceso abierto a ${targetVRF}` });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/tunnel/deactivate', async (req, res) => {
    const { ip, user, pass } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        await cleanTunnelRules(api);
        await api.close();
        res.json({ success: true, message: 'Accesos revocados' });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

// Devuelve el siguiente número de nodo disponible y la IP remota sugerida
router.post('/node/next', async (req, res) => {
    const { ip, user, pass } = req.body;
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

// Wrapper idempotente: "already have such entry" se trata como éxito
const writeIdempotent = async (api, commands) => {
    try {
        return await safeWrite(api, commands);
    } catch (e) {
        const msg = (e?.message || '').toLowerCase();
        if (msg.includes('already have such entry') || msg.includes('already exists')) return [];
        throw e;
    }
};

router.post('/node/provision', async (req, res) => {
    const { ip, user, pass, nodeNumber, nodeName, pppUser, pppPassword, lanSubnet, lanSubnets, remoteAddress } = req.body;
    const allSubnets = Array.isArray(lanSubnets) && lanSubnets.length > 0 ? lanSubnets : [lanSubnet].filter(Boolean);
    if (allSubnets.length === 0 || !allSubnets.every(s => CIDR_REGEX.test(s)) || !IPV4_REGEX.test(remoteAddress))
        return res.status(400).json({ success: false, message: 'IPs o CIDR inválidos' });

    const steps = []; let api;
    const nameUpper  = nodeName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const ifaceName  = `VPN-SSTP-ND${nodeNumber}-${nameUpper}`;
    const vrfName    = `VRF-ND${nodeNumber}-${nameUpper}`;
    const ndComment  = `ND${nodeNumber}`;

    try {
        api = await connectToMikrotik(ip, user, pass);

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
        res.json({ success: true, message: `Nodo ND${nodeNumber} provisionado correctamente`, ifaceName, vrfName, remoteAddress, steps });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user), steps, failedAt: steps.length + 1 });
    }
});

// ── Eliminar nodo (8 pasos en reversa) ─────────────────────────────────────
router.post('/node/deprovision', async (req, res) => {
    const { ip, user, pass, vrfName, pppUser, lanSubnets } = req.body;
    if (!pppUser)
        return res.status(400).json({ success: false, message: 'pppUser es requerido' });

    const hasVrf    = !!vrfName;
    const ifaceName = hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '';
    const subnets   = Array.isArray(lanSubnets) ? lanSubnets : [];
    const steps = []; let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        if (hasVrf) {
            // Paso 1: Reglas Mangle (WEB-ACCESS) asociadas al VRF
            const mangle = await safeWrite(api, ['/ip/firewall/mangle/print']);
            const mangleMatch = mangle.filter(m => m['new-routing-mark'] === vrfName);
            const tunnelIPs = mangleMatch.map(m => m['src-address']).filter(Boolean);
            for (const m of mangleMatch) await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${m['.id']}`]);
            steps.push({ step: 1, obj: 'Reglas Mangle (acceso VRF)', name: `${mangleMatch.length} eliminadas`, status: 'ok' });

            // Paso 2: vpn-activa entries de este nodo
            const addrAll = await safeWrite(api, ['/ip/firewall/address-list/print']);
            const vpnActiva = addrAll.filter(a => a.list === 'vpn-activa' && tunnelIPs.includes(a.address));
            for (const a of vpnActiva) await safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${a['.id']}`]);
            steps.push({ step: 2, obj: 'vpn-activa (sesiones activas)', name: `${vpnActiva.length} entradas`, status: 'ok' });

            // Paso 3: Rutas en la routing-table del VRF
            const routes = await safeWrite(api, ['/ip/route/print']);
            const vrfRoutes = routes.filter(r => r['routing-table'] === vrfName);
            for (const r of vrfRoutes) await safeWrite(api, ['/ip/route/remove', `=.id=${r['.id']}`]);
            steps.push({ step: 3, obj: 'Rutas VRF', name: `${vrfRoutes.length} rutas eliminadas`, status: 'ok' });

            // Paso 4: VRF
            const vrfs = await safeWrite(api, ['/ip/vrf/print']);
            const vrf = vrfs.find(v => v.name === vrfName);
            if (vrf) await safeWrite(api, ['/ip/vrf/remove', `=.id=${vrf['.id']}`]);
            steps.push({ step: 4, obj: 'VRF', name: vrfName, status: 'ok' });

            // Paso 5: LAN subnets de LIST-NET-REMOTE-TOWERS
            const addrFresh = await safeWrite(api, ['/ip/firewall/address-list/print']);
            const subnetsMatch = addrFresh.filter(a => a.list === 'LIST-NET-REMOTE-TOWERS' && subnets.includes(a.address));
            for (const a of subnetsMatch) await safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${a['.id']}`]);
            steps.push({ step: 5, obj: 'LAN subnets (LIST-NET-REMOTE-TOWERS)', name: subnets.join(', ') || '—', status: 'ok' });

            // Paso 6: Interfaz de LIST-VPN-TOWERS
            const members = await safeWrite(api, ['/interface/list/member/print']);
            const member = members.find(m => m.interface === ifaceName && m.list === 'LIST-VPN-TOWERS');
            if (member) await safeWrite(api, ['/interface/list/member/remove', `=.id=${member['.id']}`]);
            steps.push({ step: 6, obj: 'Interface List (LIST-VPN-TOWERS)', name: ifaceName, status: 'ok' });

            // Paso 7: Interfaz SSTP server
            const ifaces = await safeWrite(api, ['/interface/sstp-server/print']);
            const iface = ifaces.find(i => i.name === ifaceName);
            if (iface) await safeWrite(api, ['/interface/sstp-server/remove', `=.id=${iface['.id']}`]);
            steps.push({ step: 7, obj: 'SSTP Interface', name: ifaceName, status: 'ok' });
        } else {
            steps.push({ step: '—', obj: 'Sin VRF configurado — se omiten pasos 1-7', name: '', status: 'ok' });
        }

        // Paso 8: PPP Secret (siempre)
        const secrets = await safeWrite(api, ['/ppp/secret/print']);
        const secret = secrets.find(s => s.name === pppUser);
        if (secret) await safeWrite(api, ['/ppp/secret/remove', `=.id=${secret['.id']}`]);
        steps.push({ step: 8, obj: 'PPP Secret', name: pppUser, status: 'ok' });

        await api.close();
        res.json({ success: true, message: `Nodo eliminado correctamente`, steps });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user), steps, failedAt: steps.length + 1 });
    }
});

// ── Detalles del nodo (subnets actuales) ──────────────────────────────────
router.post('/node/details', async (req, res) => {
    const { ip, user, pass, vrfName, pppUser } = req.body;
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
        await api.close();
        res.json({
            success: true,
            lanSubnets: lanSubnets.length > 0 ? lanSubnets : vrfSubnets,
            remoteAddress: secret?.['remote-address'] || '',
            currentPppUser: secret?.name || pppUser || '',
        });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

// ── Editar nodo (password + subnets) ──────────────────────────────────────
router.post('/node/edit', async (req, res) => {
    const { ip, user, pass, pppUser, newPppUser, newPassword, newRemoteAddress, newComment, vrfName, addSubnets, removeSubnets } = req.body;
    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    const hasVrf    = !!vrfName;
    const ifaceName = hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '';
    const ndMatch   = vrfName?.match(/ND(\d+)/);
    const ndComment = ndMatch ? `ND${ndMatch[1]}` : (vrfName || '');
    const nameMatch = vrfName?.match(/VRF-ND\d+-(.+)/);
    const nameUpper = nameMatch ? nameMatch[1] : '';

    const steps = []; let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // Cambios en el PPP Secret (user, password, remote-address, comment)
        const secretChanges = [];
        if (newPassword)       secretChanges.push(`=password=${newPassword}`);
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

        await api.close();
        if (steps.length === 0)
            return res.json({ success: false, message: 'Sin cambios para aplicar', steps });
        res.json({ success: true, message: 'Nodo actualizado correctamente', steps });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user), steps, failedAt: steps.length + 1 });
    }
});

router.post('/node/script', async (req, res) => {
    const { pppUser, pppPassword, serverPublicIP } = req.body;
    if (!pppUser || !pppPassword || !serverPublicIP)
        return res.status(400).json({ success: false, message: 'pppUser, pppPassword y serverPublicIP son requeridos' });
    const script = `/interface sstp-client\nadd authentication=mschap2 connect-to=${serverPublicIP} disabled=no http-proxy=0.0.0.0 name=sstp-out1 profile=default-encryption tls-version=only-1.2 user=${pppUser} password=${pppPassword}`;
    res.json({ success: true, script });
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

router.post('/node/scan-devices', async (req, res) => {
    const { nodeLan } = req.body;
    if (!nodeLan || !CIDR_REGEX.test(nodeLan) || parseInt(nodeLan.split('/')[1], 10) < 16) return res.status(400).json({ success: false, message: 'CIDR inválido o muy grande' });
    const hostIPs = getSubnetHosts(nodeLan);
    try {
        const BATCH = 40; const allResults = [];
        for (let i = 0; i < hostIPs.length; i += BATCH) allResults.push(...await Promise.allSettled(hostIPs.slice(i, i + BATCH).map(probeUbiquiti)));
        const devices = allResults.filter(r => r.status === 'fulfilled' && r.value !== null).map(r => r.value);
        res.json({ success: true, devices, allIPs: devices.map(d => d.ip), scanned: hostIPs.length, debug: `Escaneadas ${hostIPs.length} IPs — ${devices.length} encontrados` });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/device/auto-login', async (req, res) => {
    const { ip, sshCredentials } = req.body;
    try {
        const credResult = await trySshCredentials(ip, sshCredentials);
        if (credResult) {
            res.json({ success: true, user: credResult.user, pass: credResult.pass, port: credResult.port, stats: credResult.stats });
        } else {
            res.json({ success: false, message: 'Autenticación fallida' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/device/antenna', async (req, res) => {
    const { deviceIP, deviceUser, devicePass, devicePort } = req.body;
    try {
        // Comando combinado: mca-status + system.cfg + hostname + version + ifconfig
        const output = await sshExec(deviceIP, parseInt(devicePort) || 22, deviceUser, devicePass, ANTENNA_CMD, 20000, 8000);
        res.json({ success: true, stats: parseFullOutput(output) });
    } catch (error) { res.status(500).json({ success: false, message: /[Aa]uth|handshake/.test(error.message) ? 'Credenciales incorrectas' : error.message }); }
});

// Helper: parse RouterOS duration like "2m10s" → seconds (Infinity if never)
function parseHandshakeSecs(str) {
    if (!str || str === '0s' || str === '00:00:00') return Infinity;
    let total = 0;
    const parts = str.match(/(\d+)([dhms])/g) || [];
    for (const part of parts) {
        const n = parseInt(part);
        const u = part.slice(-1);
        if (u === 's') total += n;
        else if (u === 'm') total += n * 60;
        else if (u === 'h') total += n * 3600;
        else if (u === 'd') total += n * 86400;
    }
    return parts.length > 0 ? total : Infinity;
}

router.post('/wireguard/peers', async (req, res) => {
    const { ip, user, pass } = req.body;
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const [peers, ifaces, cloud] = await Promise.all([
            safeWrite(api, ['/interface/wireguard/peers/print']),
            safeWrite(api, ['/interface/wireguard/print']),
            safeWrite(api, ['/ip/cloud/print']).catch(() => []),
        ]);
        await api.close();
        const mgmtIface = ifaces.find(i => i.name === 'VPN-WG-MGMT');
        const publicIP = cloud?.[0]?.['public-address'] || '';
        const result = peers
            .filter(p => p.interface === 'VPN-WG-MGMT')
            .map(p => {
                const secs = parseHandshakeSecs(p['last-handshake'] || '');
                return {
                    id: p['.id'],
                    name: p.comment || p.name || `Peer ${p['.id']}`,
                    allowedAddress: (p['allowed-address'] || '').split('/')[0],
                    publicKey: p['public-key'] || '',
                    lastHandshakeSecs: isFinite(secs) ? secs : null,
                    active: secs < 300,
                };
            });
        res.json({
            success: true,
            peers: result,
            serverPublicKey: mgmtIface?.['public-key'] || '',
            serverListenPort: parseInt(mgmtIface?.['listen-port'] || '0') || 0,
            serverPublicIP: publicIP,
        });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/wireguard/peer/add', async (req, res) => {
    const { ip, user, pass, name, publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ success: false, message: 'Se requiere la clave pública WireGuard' });
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
        const mgmtPeers = peers.filter(p => p.interface === 'VPN-WG-MGMT');
        const usedIPs = mgmtPeers
            .map(p => (p['allowed-address'] || '').split('/')[0])
            .filter(a => a.startsWith('192.168.21.'))
            .map(a => parseInt(a.split('.')[3]))
            .filter(n => !isNaN(n));
        const maxIP = usedIPs.length > 0 ? Math.max(...usedIPs) : 19;
        const nextIP = `192.168.21.${maxIP + 1}`;
        await writeIdempotent(api, ['/interface/wireguard/peers/add',
            '=interface=VPN-WG-MGMT',
            `=public-key=${publicKey}`,
            `=allowed-address=${nextIP}/32`,
            `=comment=${name || 'Admin'}`,
        ]);
        await api.close();
        res.json({ success: true, assignedIP: nextIP, message: `Administrador creado con IP ${nextIP}` });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/device/wifi/get', async (req, res) => {
    const { routerIP, routerUser, routerPass } = req.body;
    let api;
    try {
        api = await connectToMikrotik(routerIP, routerUser, routerPass || '');
        const [ifaces, profiles] = await Promise.allSettled([safeWrite(api, ['/interface/wireless/print']), safeWrite(api, ['/interface/wireless/security-profiles/print'])]);
        await api.close();
        res.json({
            success: true,
            interfaces: ifaces.status === 'fulfilled' ? ifaces.value.map(i => ({ id: i['.id'], name: i.name, ssid: i.ssid, mode: i.mode, disabled: i.disabled === 'true' })) : [],
            profiles: profiles.status === 'fulfilled' ? profiles.value.map(p => ({ id: p['.id'], name: p.name, wpa2Key: p['wpa2-pre-shared-key'] })) : []
        });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, routerIP, routerUser) });
    }
});

// ─────────────────────────────────────────────
// DB ENDPOINTS — Credenciales PPP de nodos
// ─────────────────────────────────────────────

router.post('/wireguard/peer/edit', async (req, res) => {
    const { ip, user, pass, peerId, newName } = req.body;
    if (!peerId || newName === undefined) return res.status(400).json({ success: false, message: 'peerId y newName requeridos' });
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        await safeWrite(api, ['/interface/wireguard/peers/set', `=.id=${peerId}`, `=comment=${newName}`]);
        await api.close();
        res.json({ success: true });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/wireguard/peer/color/save', async (req, res) => {
    const { peerAddress, color } = req.body;
    if (!peerAddress || !color) return res.status(400).json({ success: false, message: 'peerAddress y color requeridos' });
    try {
        const db = await getDb();
        await db.run('INSERT INTO peer_colors (peer_address, color) VALUES (?, ?) ON CONFLICT(peer_address) DO UPDATE SET color = excluded.color', [peerAddress, color]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/wireguard/peer/colors', async (req, res) => {
    try {
        const db = await getDb();
        const rows = await db.all('SELECT peer_address, color FROM peer_colors');
        const colors = {};
        rows.forEach(r => { colors[r.peer_address] = r.color; });
        res.json({ success: true, colors });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
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

// ─────────────────────────────────────────────
// DB ENDPOINTS (SQLite) para Dispositivos
// ─────────────────────────────────────────────

router.get('/db/devices', async (req, res) => {
    try {
        const db = await getDb();
        const rows = await db.all('SELECT data FROM devices');
        const devices = rows.map(r => decryptDevice(JSON.parse(r.data)));
        res.json({ success: true, devices });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/db/devices', async (req, res) => {
    try {
        const db = await getDb();
        const device = req.body;
        const secureDev = encryptDevice(device);
        await db.run('INSERT INTO devices (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', [device.id, JSON.stringify(secureDev)]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.delete('/db/devices/:id', async (req, res) => {
    try {
        const db = await getDb();
        await db.run('DELETE FROM devices WHERE id = ?', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── Tags por nodo ──────────────────────────────────────────────────────────
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

// ── Historial de conexión por nodo ────────────────────────────────────────
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

module.exports = router;