const express = require('express');
const router = express.Router();
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules } = require('../services/routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats } = require('../services/ubiquiti.service');

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
        const sysRoutesByVrf = {}; (routes || []).forEach(r => { if (r['routing-table'] && r['routing-table'] !== 'main' && !r['dst-address']?.endsWith('/32') && !sysRoutesByVrf[r['routing-table']]) sysRoutesByVrf[r['routing-table']] = r['dst-address']; });

        const nodes = secrets.filter(s => s.service === 'sstp').map(secret => {
            const name = secret.name || 'Unknown';
            const session = activeByName[name];
            const nombreVrf = vrfByInterface[sstpIfaceByUser[name] || ''] || '';
            return {
                id: secret['.id'], nombre_nodo: (secret.comment || name).replace(/Torre|torre|-ND\d+/gi, '').trim() || name,
                ppp_user: name, segmento_lan: secret.routes || sysRoutesByVrf[nombreVrf] || '', nombre_vrf: nombreVrf,
                service: secret.service || 'sstp', disabled: secret.disabled === 'true' || secret.disabled === true,
                running: !!session, ip_tunnel: session ? session.address : '', uptime: session ? session.uptime : '',
            };
        });
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

router.post('/node/provision', async (req, res) => {
    const { ip, user, pass, nodeNumber, nodeName, pppUser, pppPassword, lanSubnet, remoteAddress } = req.body;
    if (!CIDR_REGEX.test(lanSubnet) || !IPV4_REGEX.test(remoteAddress)) return res.status(400).json({ success: false, message: `IPs o CIDR inválidos` });
    const steps = []; let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const ifaceName = `VPN-SSTP-ND${nodeNumber}-${nodeName.toUpperCase()}`;
        const vrfName = `VRF-ND${nodeNumber}-${nodeName.toUpperCase()}`;
        await safeWrite(api, ['/ppp/secret/add', `=name=${pppUser}`, `=password=${pppPassword}`, '=service=sstp', '=profile=PROF-VPN-TOWERS', `=remote-address=${remoteAddress}`, `=comment=Torre${nodeName}`]); steps.push({ step: 1, obj: 'PPP Secret', name: pppUser, status: 'ok' });
        await safeWrite(api, ['/interface/sstp-server/add', `=name=${ifaceName}`, `=user=${pppUser}`]); steps.push({ step: 2, obj: 'SSTP Binding', name: ifaceName, status: 'ok' });
        await safeWrite(api, ['/ip/vrf/add', `=name=${vrfName}`, '=interfaces=']); steps.push({ step: 3, obj: 'VRF', name: vrfName, status: 'ok' });
        await safeWrite(api, ['/ip/route/add', `=dst-address=${lanSubnet}`, `=gateway=${remoteAddress}`, `=routing-table=${vrfName}`]); steps.push({ step: 4, obj: 'Route', name: vrfName, status: 'ok' });
        await safeWrite(api, ['/ip/firewall/address-list/add', '=list=LIST-NET-REMOTE-TOWERS', `=address=${lanSubnet}`, `=comment=LAN Torre${nodeName}`]); steps.push({ step: 5, obj: 'Address List', name: lanSubnet, status: 'ok' });
        await safeWrite(api, ['/interface/list/member/add', `=interface=${ifaceName}`, '=list=LIST-VPN-TOWERS']); steps.push({ step: 6, obj: 'Interface List', name: ifaceName, status: 'ok' });
        await api.close();
        res.json({ success: true, message: `Nodo provisionado`, ifaceName, vrfName, steps });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user), steps, failedAt: steps.length + 1 });
    }
});

router.post('/node/script', async (req, res) => {
    const { nodeName, pppUser, pppPassword, lanSubnet, serverPublicIP } = req.body;
    const [netAddr, mask] = lanSubnet.split('/');
    const maskBits = parseInt(mask, 10);
    const ipParts = netAddr.split('.').map(Number);
    const ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
    const maskNum = maskBits > 0 ? (~0 << (32 - maskBits)) >>> 0 : 0;
    const netBase = (ipNum & maskNum) >>> 0;
    const toOctets = n => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF].join('.');
    const gatewayIP = toOctets((netBase + 1) >>> 0);
    const script = `/interface bridge\nadd name=BR-LAN comment="Bridge LAN ${nodeName}"\n/ip address\nadd address=${gatewayIP}/${mask} interface=BR-LAN network=${netAddr}\n/ip pool\nadd name=pool-lan ranges=${toOctets((netBase + 100) >>> 0)}-${toOctets((netBase + 254) >>> 0)}\n/ip dhcp-server\nadd address-pool=pool-lan interface=BR-LAN name=dhcp-lan disabled=no\n/ip dhcp-server network\nadd address=${lanSubnet} gateway=${gatewayIP} dns-server=8.8.8.8,8.8.4.4\n/interface sstp-client\nadd name=sstp-out1 connect-to=${serverPublicIP}:443 user=${pppUser} password=${pppPassword} profile=default-encryption tls-version=only-1.2 authentication=mschap2 comment="VPN Central"\n/ip firewall nat\nadd action=masquerade chain=srcnat out-interface=sstp-out1 comment="NAT VPN"\n/ip dns\nset servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes\n`;
    res.json({ success: true, script });
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

router.post('/device/antenna', async (req, res) => {
    const { deviceIP, deviceUser, devicePass, devicePort } = req.body;
    try {
        const output = await sshExec(deviceIP, parseInt(devicePort) || 22, deviceUser, devicePass, 'mca-status');
        res.json({ success: true, stats: parseAirOSStats(output) });
    } catch (error) { res.status(500).json({ success: false, message: /[Aa]uth|handshake/.test(error.message) ? 'Credenciales incorrectas' : error.message }); }
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

module.exports = router;