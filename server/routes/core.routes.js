const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');

// ── SSE: lista de clientes suscritos a eventos de túnel ──────────────────────
const sseClients = new Set();

function broadcastTunnelEvent(activeNodeVrf, tunnelExpiry) {
    const payload = JSON.stringify({ activeNodeVrf: activeNodeVrf || null, tunnelExpiry: tunnelExpiry || null });
    for (const client of sseClients) {
        try { client.write(`data: ${payload}\n\n`); } catch (_) { sseClients.delete(client); }
    }
}
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules, writeIdempotent } = require('../routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, saveNode, getNodes, deleteNode, setAppSetting, getAppSetting } = require('../db.service');

router.post('/connect', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    if (!ip || !user) return res.status(400).json({ success: false, message: 'Faltan credenciales' });
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const resource = await safeWrite(api, ['/system/resource/print']);
        await api.close();
        res.json({ success: true, message: 'Conectado exitosamente', data: resource });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        const msg = getErrorMessage(error, ip, user);
        console.error(`[CONNECT] Fallo → IP:${ip} usuario:${user} | errno:${JSON.stringify(error?.errno)} code:${error?.code} msg:${error?.message}`);
        res.status(500).json({ success: false, message: msg });
    }
});

router.post('/diagnose', async (req, res) => {
    const net = require('net');
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    if (!ip) return res.status(400).json({ success: false });
    const steps = [];
    const probe = (port) => new Promise((resolve) => {
        const s = net.createConnection({ host: ip, port, timeout: 5000 });
        s.once('connect', () => { s.destroy(); resolve({ port, open: true }); });
        s.once('timeout', () => { s.destroy(); resolve({ port, open: false, reason: 'timeout' }); });
        s.once('error',   (e) => { resolve({ port, open: false, reason: e.code || e.message }); });
    });
    const [r8728, r8729] = await Promise.all([probe(8728), probe(8729)]);
    steps.push(r8728);
    steps.push(r8729);
    let authOk = false, authMsg = '';
    if ((r8728.open || r8729.open) && user) {
        let api;
        try {
            api = await connectToMikrotik(ip, user, pass);
            await api.close();
            authOk = true; authMsg = 'Credenciales correctas';
        } catch (e) {
            authMsg = getErrorMessage(e, ip, user);
        }
    }
    res.json({ steps, authOk, authMsg, apiReachable: r8728.open || r8729.open });
});

router.post('/secrets', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
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
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
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
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { vpnName, vpnService } = req.body;
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
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { vpnName, vpnService } = req.body;
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

router.post('/tunnel/activate', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { tunnelIP, targetVRF } = req.body;
    if (!IPV4_REGEX.test(tunnelIP)) return res.status(400).json({ success: false, message: `tunnelIP inválida: "${tunnelIP}"` });
    if (!targetVRF) return res.status(400).json({ success: false, message: 'targetVRF requerido' });
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);

        // Leer estado actual de address-list y mangle en una sola conexión
        const [addrsResult, mangleResult] = await Promise.allSettled([
            safeWrite(api, ['/ip/firewall/address-list/print'], 3000),
            safeWrite(api, ['/ip/firewall/mangle/print'], 3000),
        ]);
        const allAddrs  = addrsResult.status  === 'fulfilled' ? addrsResult.value  : [];
        const allMangle = mangleResult.status === 'fulfilled' ? mangleResult.value : [];

        // Agregar a vpn-activa solo si esta IP específica no existe ya
        const alreadyInList = allAddrs.some(a => a.list === 'vpn-activa' && a.address === tunnelIP);
        if (!alreadyInList) {
            await writeIdempotent(api, [
                '/ip/firewall/address-list/add',
                '=list=vpn-activa',
                `=address=${tunnelIP}`,
                '=comment=User Access',
            ]);
            console.log(`[TUNNEL-ACTIVATE] Agregado ${tunnelIP} a vpn-activa`);
        } else {
            console.log(`[TUNNEL-ACTIVATE] ${tunnelIP} ya existe en vpn-activa — sin cambios en address-list`);
        }

        // Siempre limpiar mangles de esta IP que apunten a un VRF diferente (stale por cambio de sesión)
        const staleIds = allMangle
            .filter(m =>
                m.comment === 'WEB-ACCESS' &&
                m['src-address'] === tunnelIP &&
                m['new-routing-mark'] !== targetVRF &&
                m['.id']
            )
            .map(m => m['.id']);
        for (const staleId of staleIds) {
            await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${staleId}`]);
            console.log(`[TUNNEL-ACTIVATE] Mangle stale eliminado: id=${staleId} IP=${tunnelIP} VRF≠${targetVRF}`);
        }

        // Agregar mangle WEB-ACCESS solo si la combinación exacta (IP + VRF) no existe aún
        const alreadyHasMangle = allMangle.some(m =>
            m.comment === 'WEB-ACCESS' &&
            m['src-address'] === tunnelIP &&
            m['new-routing-mark'] === targetVRF
        );
        if (!alreadyHasMangle) {
            await writeIdempotent(api, [
                '/ip/firewall/mangle/add',
                '=chain=prerouting',
                `=src-address=${tunnelIP}`,
                '=dst-address-list=LIST-NET-REMOTE-TOWERS',
                '=action=mark-routing',
                `=new-routing-mark=${targetVRF}`,
                '=passthrough=yes',
                '=comment=WEB-ACCESS',
            ]);
            console.log(`[TUNNEL-ACTIVATE] Mangle WEB-ACCESS creado para ${tunnelIP} → ${targetVRF}`);
        } else {
            console.log(`[TUNNEL-ACTIVATE] Mangle WEB-ACCESS ya existe para ${tunnelIP} → ${targetVRF} — sin cambios`);
        }

        await api.close();

        const TUNNEL_TIMEOUT_MS = 30 * 60 * 1000; // 30 min, igual que el frontend
        const expiry = Date.now() + TUNNEL_TIMEOUT_MS;
        await setAppSetting('active_vrf', targetVRF);
        await setAppSetting('tunnel_ip', tunnelIP);
        await setAppSetting('tunnel_expiry', String(expiry));
        broadcastTunnelEvent(targetVRF, expiry);
        res.json({ success: true, message: `Acceso abierto a ${targetVRF}` });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        const msg = getErrorMessage(error, ip, user);
        console.error('[TUNNEL-ACTIVATE] Error:', error?.message || error, '| Detalles:', error?.code, error?.errno);
        res.status(500).json({ success: false, message: msg });
    }
});

router.post('/tunnel/deactivate', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    let api;
    try {
        // Recuperar la IP del túnel activo desde app_settings para no depender del frontend
        // El frontend puede enviarla en el body como fallback secundario
        const savedTunnelIP = await getAppSetting('tunnel_ip');
        const tunnelIP = savedTunnelIP || req.body?.tunnelIP || null;

        api = await connectToMikrotik(ip, user, pass);

        if (tunnelIP) {
            // Eliminar solo las entradas de esta IP específica
            await cleanTunnelRules(api, tunnelIP);
            console.log(`[TUNNEL-DEACTIVATE] Reglas eliminadas para IP=${tunnelIP}`);
        } else {
            // Sin tunnelIP conocida (sesión antigua) — limpiar todos los mangles WEB-ACCESS
            // y todas las entradas vpn-activa comment=User Access como fallback seguro
            console.warn('[TUNNEL-DEACTIVATE] tunnelIP desconocida — aplicando limpieza por comment (fallback)');
            await cleanTunnelRules(api, null);
            console.log('[TUNNEL-DEACTIVATE] Limpieza por comment completada (fallback null)');
        }

        await api.close();
        await setAppSetting('active_vrf', '');
        await setAppSetting('tunnel_ip', '');
        await setAppSetting('tunnel_expiry', '');
        broadcastTunnelEvent(null, null);
        res.json({ success: true, message: 'Accesos revocados' });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
    }
});

router.post('/tunnel/keepalive', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { tunnelIP, targetVRF } = req.body;
    if (!IPV4_REGEX.test(tunnelIP)) return res.status(400).json({ success: false, message: `tunnelIP inválida: "${tunnelIP}"` });
    if (!targetVRF) return res.status(400).json({ success: false, message: 'targetVRF requerido' });
    let api;
    try {
        api = await connectToMikrotik(ip, user, pass);
        const [addrsResult, mangleResult] = await Promise.allSettled([
            safeWrite(api, ['/ip/firewall/address-list/print'], 3000),
            safeWrite(api, ['/ip/firewall/mangle/print'], 3000),
        ]);
        const addrs  = addrsResult.status  === 'fulfilled' ? addrsResult.value  : [];
        const mangle = mangleResult.status === 'fulfilled' ? mangleResult.value : [];

        const restoredItems = [];

        // Verificar address-list vpn-activa
        const hasAddr = addrs.some(a => a.list === 'vpn-activa' && a.address === tunnelIP);
        if (!hasAddr) {
            await safeWrite(api, ['/ip/firewall/address-list/add', '=list=vpn-activa', `=address=${tunnelIP}`, '=comment=User Access']);
            restoredItems.push('vpn-activa');
        }

        // Verificar mangle WEB-ACCESS para este VRF específico
        const hasMangleForVRF = mangle.some(m =>
            m.comment === 'WEB-ACCESS' &&
            m['src-address'] === tunnelIP &&
            m['new-routing-mark'] === targetVRF
        );
        if (!hasMangleForVRF) {
            // Limpiar mangle obsoleto para este mismo VRF (si quedó huérfano con otra IP)
            const staleMangleIds = mangle
                .filter(m => m.comment === 'WEB-ACCESS' && m['new-routing-mark'] === targetVRF && m['.id'])
                .map(m => m['.id']);
            for (const id of staleMangleIds) {
                await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${id}`]);
            }
            await safeWrite(api, [
                '/ip/firewall/mangle/add',
                '=chain=prerouting',
                `=src-address=${tunnelIP}`,
                '=dst-address-list=LIST-NET-REMOTE-TOWERS',
                '=action=mark-routing',
                `=new-routing-mark=${targetVRF}`,
                '=passthrough=yes',
                '=comment=WEB-ACCESS',
            ]);
            restoredItems.push('mangle-WEB-ACCESS');
        }

        await api.close();
        const restored = restoredItems.length > 0;
        console.log(`[KEEPALIVE] VRF=${targetVRF} IP=${tunnelIP} — ${restored ? 'RESTAURADO: ' + restoredItems.join(', ') : 'OK (sin cambios)'}`);
        res.json({ success: true, restored, restoredItems });
    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        const msg = getErrorMessage(error, ip, user);
        console.error('[KEEPALIVE] Error:', error?.message);
        res.status(500).json({ success: false, message: msg });
    }
});

// SSE: el cliente se suscribe y recibe eventos push cuando el túnel cambia
router.get('/tunnel/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    // Heartbeat cada 25s para evitar que proxies cierren la conexión idle
    const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25_000);
    req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
});

router.get('/tunnel/status', async (req, res) => {
    const vrf    = await getAppSetting('active_vrf');
    const expiry = await getAppSetting('tunnel_expiry');
    const expiryMs = expiry ? parseInt(expiry) : null;
    // Si el túnel ya expiró, limpiar y retornar vacío
    if (expiryMs && Date.now() > expiryMs) {
        await setAppSetting('active_vrf', '');
        await setAppSetting('tunnel_ip', '');
        await setAppSetting('tunnel_expiry', '');
        return res.json({ success: true, activeNodeVrf: null, tunnelExpiry: null });
    }
    res.json({
        success: true,
        activeNodeVrf: vrf || null,
        tunnelExpiry: expiryMs || null,
    });
});

// ── POST /tunnel/repair — verifica y reconstruye la config completa de un nodo VPN ──
router.post('/tunnel/repair', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { pppUser, vrfName, lanSubnets, tunnelIP, adminWgNet } = req.body;

    if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
    if (!vrfName) return res.status(400).json({ success: false, message: 'vrfName requerido' });
    if (!Array.isArray(lanSubnets) || lanSubnets.length === 0)
        return res.status(400).json({ success: false, message: 'lanSubnets debe ser un array no vacío' });

    // Detectar protocolo: WG si empieza con WG-ND (nodos torre) o VPN-WG- (gestión)
    const isWG       = (pppUser || '').startsWith('WG-ND') || (pppUser || '').startsWith('VPN-WG-');
    // ifaceName: para WG === pppUser; para SSTP se deriva del VRF
    const ifaceName  = isWG ? pppUser : vrfName.replace(/^VRF-/, 'VPN-SSTP-');
    const wgMgmtNet  = adminWgNet || '192.168.21.0/24';
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
                const nodeRowDB = await db.get('SELECT data FROM nodes WHERE id = ?', [pppUser]);
                let ipTunnel = '', wgPubKey = '';
                if (nodeRowDB && nodeRowDB.data) {
                    try {
                        const parsed = JSON.parse(nodeRowDB.data);
                        ipTunnel = parsed.ip_tunnel;
                        wgPubKey = parsed.wg_public_key || parsed.cpePublicKey;
                    } catch (e) { /* ignore */ }
                }

                // Restaurar IP Address WG
                if (ipTunnel) {
                    const existsIp = allIpAddrs.some(a => a.interface === ifaceName && a.address.startsWith(ipTunnel.split('/')[0]));
                    if (existsIp) {
                        steps.push({ step: 1.1, obj: 'WG IP', name: ipTunnel, status: 'ok', action: 'exists' });
                    } else {
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

        // Ruta de retorno MGMT hacia VPN-WG-MGMT
        try {
            const existsMgmtRoute = allRoutes.some(r =>
                r['dst-address'] === wgMgmtNet &&
                r['routing-table'] === vrfName &&
                r.dynamic !== 'true'
            );
            if (existsMgmtRoute) {
                steps.push({ step: 4, obj: 'VRF Route MGMT', name: wgMgmtNet, status: 'ok', action: 'exists' });
            } else {
                await writeIdempotent(api, [
                    '/ip/route/add',
                    `=dst-address=${wgMgmtNet}`,
                    '=gateway=VPN-WG-MGMT',
                    `=routing-table=${vrfName}`,
                    '=distance=2',
                ]);
                steps.push({ step: 4, obj: 'VRF Route MGMT', name: wgMgmtNet, status: 'created', action: 'created' });
                repaired++;
            }
        } catch (e) {
            steps.push({ step: 4, obj: 'VRF Route MGMT', name: wgMgmtNet, status: 'error', action: e.message });
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

        // ── Paso 6: vpn-activa (solo si tunnelIP presente) ──────────────────────
        if (tunnelIP) {
            try {
                const existsInVpnActiva = allAddrs.some(a =>
                    a.list === 'vpn-activa' && a.address === tunnelIP
                );
                if (existsInVpnActiva) {
                    steps.push({ step: 6, obj: 'vpn-activa', name: tunnelIP, status: 'ok', action: 'exists' });
                } else {
                    await writeIdempotent(api, [
                        '/ip/firewall/address-list/add',
                        '=list=vpn-activa',
                        `=address=${tunnelIP}`,
                        '=comment=User Access',
                    ]);
                    steps.push({ step: 6, obj: 'vpn-activa', name: tunnelIP, status: 'created', action: 'created' });
                    repaired++;
                }
            } catch (e) {
                steps.push({ step: 6, obj: 'vpn-activa', name: tunnelIP, status: 'error', action: e.message });
            }
        } else {
            steps.push({ step: 6, obj: 'vpn-activa', name: null, status: 'skipped', action: 'no tunnelIP' });
        }

        // ── Paso 7: Mangle WEB-ACCESS (solo si tunnelIP y vrfName presentes) ────
        if (tunnelIP && vrfName) {
            try {
                const existsMangle = allMangle.some(m =>
                    m.comment === 'WEB-ACCESS' &&
                    m['src-address'] === tunnelIP &&
                    m['new-routing-mark'] === vrfName
                );
                if (existsMangle) {
                    steps.push({ step: 7, obj: 'Mangle WEB-ACCESS', name: `${tunnelIP}→${vrfName}`, status: 'ok', action: 'exists' });
                } else {
                    await writeIdempotent(api, [
                        '/ip/firewall/mangle/add',
                        '=chain=prerouting',
                        `=src-address=${tunnelIP}`,
                        '=dst-address-list=LIST-NET-REMOTE-TOWERS',
                        '=action=mark-routing',
                        `=new-routing-mark=${vrfName}`,
                        '=passthrough=yes',
                        '=comment=WEB-ACCESS',
                    ]);
                    steps.push({ step: 7, obj: 'Mangle WEB-ACCESS', name: `${tunnelIP}→${vrfName}`, status: 'created', action: 'created' });
                    repaired++;
                }
            } catch (e) {
                steps.push({ step: 7, obj: 'Mangle WEB-ACCESS', name: `${tunnelIP}→${vrfName}`, status: 'error', action: e.message });
            }
        } else {
            steps.push({ step: 7, obj: 'Mangle WEB-ACCESS', name: null, status: 'skipped', action: 'no tunnelIP or vrfName' });
        }

        await api.close();
        console.log(`[TUNNEL-REPAIR] pppUser=${pppUser} vrfName=${vrfName} repaired=${repaired}/${steps.length}`);
        res.json({ success: true, steps, repaired });

    } catch (error) {
        if (api) try { await api.close(); } catch (_) { }
        const msg = getErrorMessage(error, ip, user);
        console.error('[TUNNEL-REPAIR] Error:', error?.message);
        res.status(500).json({ success: false, message: msg });
    }
});

module.exports = router;
