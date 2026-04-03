const express = require('express');
const router = express.Router();
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules } = require('../routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, saveNode, getNodes, deleteNode } = require('../db.service');

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
    const { deviceIP, deviceUser, devicePass, devicePort, deviceId } = req.body;
    try {
        let actualPass = devicePass;
        if (deviceId && !actualPass) {
            const db = await getDb();
            const row = await db.get('SELECT clave_ssh FROM aps WHERE id = ?', [deviceId]);
            if (row && row.clave_ssh) actualPass = decryptPass(row.clave_ssh);
        }
        
        // Comando combinado: mca-status + system.cfg + hostname + version + ifconfig
        const output = await sshExec(deviceIP, parseInt(devicePort) || 22, deviceUser, actualPass || '', ANTENNA_CMD, 20000, 8000);
        res.json({ success: true, stats: parseFullOutput(output) });
    } catch (error) {
        const msg = error.message || '';
        const isAuth    = /[Aa]uth|handshake|All configured|incorrect|denied/i.test(msg);
        const isRefused = /ECONNREFUSED|connection refused/i.test(msg);
        const isTimeout = /timeout|agotado|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(msg);
        const isUnreach = /EHOSTUNREACH|ENETUNREACH|ENOTFOUND/i.test(msg);
        const friendly  = isAuth    ? 'Credenciales incorrectas'
                        : isRefused ? 'SSH no disponible (puerto cerrado)'
                        : isTimeout ? 'Tiempo de espera SSH agotado'
                        : isUnreach ? 'Host no alcanzable'
                        : msg;
        console.log(`[SSH] ${deviceIP} → ${friendly}`);
        // 200 para errores esperados (auth, red) — 500 solo para errores inesperados del servidor
        res.json({ success: false, message: friendly });
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

// A partir de este punto: Endpoints Migrados 100% a la tabla de Auditoria SQL "aps"

router.get('/db/devices', async (req, res) => {
    try {
        const db = await getDb();
        const rows = await db.all('SELECT * FROM aps');
        // Convertir estructura relacional estricta a estructura "SavedDevice" esquelética
        const devices = rows.map(r => ({
            id: r.id,
            mac: r.id,
            nodeId: r.nodo_id,
            ip: r.ip,
            name: r.hostname,
            deviceName: r.hostname,
            model: r.modelo,
            firmware: r.firmware,
            frequency: r.frecuencia_ghz,
            channelWidth: r.canal_mhz,
            essid: r.ssid,
            lanMac: r.mac_lan,
            wlanMac: r.mac_wlan,
            role: r.modo_red === 'station' ? 'sta' : 'ap',
            sshUser: r.usuario_ssh,
            hasSshPass: !!r.clave_ssh,
            sshPort: r.puerto_ssh,
            wifiPassword: r.wifi_password,
            activo: r.activo === 1,
            lastCpeCount: r.cpes_conectados_count,
            lastCpeCountAt: r.last_saved,
            addedAt: r.registrado_en,
            nodeName: r.nombre_nodo || '',
            routerPort: r.router_port || 8075,
            lastSeen: r.last_seen || 0
        }));
        res.json({ success: true, devices });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.post('/db/devices', async (req, res) => {
    try {
        const db = await getDb();
        const d = req.body;
        const now = Date.now();
        
        let cpesCount = 0;
        if (d.cachedStats && d.cachedStats.stations) {
            cpesCount = d.cachedStats.stations.length;
        } else if (typeof d.lastCpeCount === 'number') {
            cpesCount = d.lastCpeCount;
        }

        const sshEncrypted = d.sshPass ? encryptPass(d.sshPass) : '';
        const wifiPassword = d.wifiPassword || '';

        // UPSERT en la tabla "aps"
        await db.run(
            `INSERT INTO aps (
                id, nodo_id, hostname, modelo, firmware, mac_lan, mac_wlan, ip, frecuencia_ghz,
                ssid, canal_mhz, modo_red, usuario_ssh, clave_ssh, puerto_ssh, wifi_password,
                cpes_conectados_count, last_saved, activo, nombre_nodo, router_port, last_seen,
                registrado_en
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                nodo_id = excluded.nodo_id,
                hostname = excluded.hostname,
                modelo = excluded.modelo,
                firmware = excluded.firmware,
                ip = excluded.ip,
                frecuencia_ghz = excluded.frecuencia_ghz,
                ssid = excluded.ssid,
                canal_mhz = excluded.canal_mhz,
                modo_red = excluded.modo_red,
                usuario_ssh = excluded.usuario_ssh,
                clave_ssh = excluded.clave_ssh,
                puerto_ssh = excluded.puerto_ssh,
                wifi_password = excluded.wifi_password,
                cpes_conectados_count = excluded.cpes_conectados_count,
                last_saved = excluded.last_saved,
                activo = excluded.activo,
                nombre_nodo = excluded.nombre_nodo,
                router_port = excluded.router_port,
                last_seen = excluded.last_seen`,
            [
                d.id, d.nodeId || '', d.name || d.deviceName || '', d.model || '', d.firmware || '',
                d.lanMac || '', d.wlanMac || '', d.ip || '', d.frequency || 0, d.essid || '',
                d.channelWidth || 0, d.role === 'sta' ? 'station' : 'ap',
                d.sshUser || '', sshEncrypted, d.sshPort || 22, wifiPassword,
                cpesCount, now, d.activo !== false ? 1 : 0,
                d.nodeName || '', d.routerPort || 8075, d.lastSeen || 0,
                d.addedAt || now
            ]
        );
        res.json({ success: true, id: d.id });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.put('/db/devices/:id', async (req, res) => {
    try {
        const db = await getDb();
        const id = req.params.id;
        const exists = await db.get('SELECT id FROM aps WHERE id = ?', [id]);
        if (!exists) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        
        const d = req.body;
        const now = Date.now();
        
        let cpesCount = 0;
        if (d.cachedStats && d.cachedStats.stations) {
            cpesCount = d.cachedStats.stations.length;
        } else if (typeof d.lastCpeCount === 'number') {
            cpesCount = d.lastCpeCount;
        }

        const sshEncrypted = d.sshPass ? encryptPass(d.sshPass) : '';
        const wifiPassword = d.wifiPassword || '';

        await db.run(
            `UPDATE aps SET 
                nodo_id = ?, hostname = ?, modelo = ?, firmware = ?, ip = ?, 
                frecuencia_ghz = ?, ssid = ?, canal_mhz = ?, modo_red = ?, 
                usuario_ssh = ?, clave_ssh = ?, puerto_ssh = ?, wifi_password = ?,
                cpes_conectados_count = ?, last_saved = ?
             WHERE id = ?`, 
            [
                d.nodeId || '', d.name || d.deviceName || '', d.model || '', d.firmware || '', d.ip || '',
                d.frequency || 0, d.essid || '', d.channelWidth || 0, d.role === 'sta' ? 'station' : 'ap',
                d.sshUser || '', sshEncrypted, d.sshPort || 22, wifiPassword,
                cpesCount, now, id
            ]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.delete('/db/devices/:id', async (req, res) => {
    try {
        const db = await getDb();
        await db.run('DELETE FROM aps WHERE id = ?', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Limpieza basada en la relación Nodos <-> APs
router.post('/db/cleanup-orphan-devices', async (req, res) => {
    try {
        const db = await getDb();

        const validNodes = await db.all('SELECT id, data FROM nodes');
        if (validNodes.length === 0) {
            return res.json({ success: true, devicesDeleted: 0, cpesDeleted: 0, historialDeleted: 0, orphanIds: [], message: 'No hay nodos válidos — limpieza abortada por seguridad' });
        }

        const validMikrotikIds = new Set();
        for (const n of validNodes) {
            try {
                const d = JSON.parse(n.data);
                if (d.id) validMikrotikIds.add(d.id);
            } catch { /* ignore */ }
            validMikrotikIds.add(n.id); 
        }

        const allAPs = await db.all('SELECT id, nodo_id FROM aps');
        const orphans = allAPs.filter(ap => !validMikrotikIds.has(ap.nodo_id));

        if (orphans.length === 0) {
            return res.json({ success: true, devicesDeleted: 0, cpesDeleted: 0, historialDeleted: 0, orphanIds: [], message: 'No se encontraron APs huérfanos' });
        }

        const orphanIds = orphans.map(d => d.id);
        const placeholders = orphanIds.map(() => '?').join(',');

        // Las bases relacionales con deletes vinculados (si tuvieramos más tablas dependientes, las borramos aquí).
        const cpesResult = await db.run(`DELETE FROM cpes_conocidos WHERE ap_id IN (${placeholders})`, orphanIds);
        const devResult = await db.run(`DELETE FROM aps WHERE id IN (${placeholders})`, orphanIds);

        res.json({
            success: true,
            devicesDeleted: devResult.changes,
            cpesDeleted: cpesResult.changes,
            orphanIds,
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
