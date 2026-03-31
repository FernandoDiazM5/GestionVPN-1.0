const express = require('express');
const router = express.Router();
const { connectToMikrotik, safeWrite, getErrorMessage, writeIdempotent, parseHandshakeSecs } = require('../routeros.service');
const { getDb } = require('../db.service');

router.post('/wireguard/peers', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
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
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { name, publicKey } = req.body;
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

router.post('/wireguard/peer/edit', async (req, res) => {
    if (!req.mikrotik) return res.status(503).json({ success: false, needsConfig: true, message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.' });
    const { ip, user, pass } = req.mikrotik;
    const { peerId, newName } = req.body;
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

module.exports = router;
