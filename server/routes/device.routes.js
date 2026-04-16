const express = require('express');
const router = express.Router();
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules } = require('../routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptPass, decryptPass, getApByUuid, getApIntId, getApGroupIntId } = require('../db.service');

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
        // deviceId from frontend is the UUID
        if (deviceId && !actualPass) {
            const db = await getDb();
            const row = await db.get('SELECT clave_ssh_enc FROM aps WHERE uuid = ?', [deviceId]);
            if (row && row.clave_ssh_enc) actualPass = decryptPass(row.clave_ssh_enc);
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

// A partir de este punto: Endpoints Migrados 100% a la tabla de Auditoria SQL "aps" (schema v2)

router.get('/db/devices', async (req, res) => {
    try {
        const db = await getDb();
        const rows = await db.all(
            `SELECT a.*, ag.uuid AS ap_group_uuid
             FROM aps a
             LEFT JOIN ap_groups ag ON ag.id = a.ap_group_id`
        );
        // Convertir estructura relacional v2 a estructura "SavedDevice" esquelética
        const devices = rows.map(r => ({
            id: r.uuid,
            mac: r.uuid,
            nodeId: r.ap_group_uuid || null,
            ip: r.ip,
            name: r.hostname,
            deviceName: r.hostname,
            model: r.modelo,
            firmware: r.firmware,
            frequency: r.frecuencia_mhz,
            channelWidth: r.canal_mhz,
            essid: r.ssid,
            lanMac: r.mac_lan,
            wlanMac: r.mac_wlan,
            role: r.modo_red === 'station' ? 'sta' : 'ap',
            sshUser: r.usuario_ssh,
            hasSshPass: !!r.clave_ssh_enc,
            sshPort: r.puerto_ssh,
            wifiPassword: r.wifi_password_enc ? '********' : '',
            is_active: r.is_active === 1,
            lastCpeCount: r.cpes_conectados_count,
            lastCpeCountAt: r.last_saved,
            addedAt: r.created_at,
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

        const sshEncrypted = d.sshPass ? encryptPass(d.sshPass) : null;
        const wifiEncrypted = d.wifiPassword ? encryptPass(d.wifiPassword) : null;

        // Resolve ap_group_id from the nodeId sent by frontend
        // nodeId puede ser: UUID del ap_group, o un valor legacy (ppp_user, mikrotik_id, etc.)
        let apGroupId = d.nodeId ? await getApGroupIntId(d.nodeId) : null;
        if (d.nodeId && !apGroupId) {
            // Fallback: buscar ap_group por nombre (nodeName)
            if (d.nodeName) {
                const byName = await db.get('SELECT id FROM ap_groups WHERE nombre = ?', [d.nodeName]);
                if (byName) {
                    apGroupId = byName.id;
                } else {
                    // Auto-crear grupo con el nombre del nodo
                    const crypto = require('crypto');
                    const newUuid = crypto.randomBytes(8).toString('hex');
                    const result = await db.run(
                        'INSERT INTO ap_groups (uuid, nombre, descripcion, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                        [newUuid, d.nodeName, 'Auto-creado', Date.now(), Date.now()]
                    );
                    apGroupId = result.lastID;
                }
            }
            // Si aún no hay grupo, continuar con null (no bloquear el guardado)
        }

        // UPSERT en la tabla "aps" (schema v2: uuid UNIQUE, id INTEGER AUTO)
        await db.run(
            `INSERT INTO aps (
                uuid, ap_group_id, hostname, modelo, firmware, mac_lan, mac_wlan, ip, frecuencia_mhz,
                ssid, canal_mhz, modo_red, usuario_ssh, clave_ssh_enc, puerto_ssh, wifi_password_enc,
                cpes_conectados_count, last_saved, is_active, nombre_nodo, router_port, last_seen,
                created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(uuid) DO UPDATE SET
                ap_group_id = excluded.ap_group_id,
                hostname = excluded.hostname,
                modelo = excluded.modelo,
                firmware = excluded.firmware,
                ip = excluded.ip,
                frecuencia_mhz = excluded.frecuencia_mhz,
                ssid = excluded.ssid,
                canal_mhz = excluded.canal_mhz,
                modo_red = excluded.modo_red,
                usuario_ssh = excluded.usuario_ssh,
                clave_ssh_enc = CASE WHEN excluded.clave_ssh_enc IS NOT NULL THEN excluded.clave_ssh_enc ELSE aps.clave_ssh_enc END,
                puerto_ssh = excluded.puerto_ssh,
                wifi_password_enc = CASE WHEN excluded.wifi_password_enc IS NOT NULL THEN excluded.wifi_password_enc ELSE aps.wifi_password_enc END,
                cpes_conectados_count = excluded.cpes_conectados_count,
                last_saved = excluded.last_saved,
                is_active = excluded.is_active,
                nombre_nodo = excluded.nombre_nodo,
                router_port = excluded.router_port,
                last_seen = excluded.last_seen,
                updated_at = ${now}`,
            [
                d.id, apGroupId, d.name || d.deviceName || '', d.model || '', d.firmware || '',
                d.lanMac || '', d.wlanMac || '', d.ip || '', d.frequency || null, d.essid || '',
                d.channelWidth || null, d.role === 'sta' ? 'station' : 'ap',
                d.sshUser || '', sshEncrypted, d.sshPort || 22, wifiEncrypted,
                cpesCount, now, (d.is_active !== false && d.is_active !== 0) ? 1 : 0,
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
        const uuid = req.params.id; // frontend sends UUID as :id
        const exists = await db.get('SELECT id FROM aps WHERE uuid = ?', [uuid]);
        if (!exists) return res.status(404).json({ success: false, message: 'AP no encontrado' });

        const d = req.body;
        const now = Date.now();

        let cpesCount = 0;
        if (d.cachedStats && d.cachedStats.stations) {
            cpesCount = d.cachedStats.stations.length;
        } else if (typeof d.lastCpeCount === 'number') {
            cpesCount = d.lastCpeCount;
        }

        const sshEncrypted = d.sshPass ? encryptPass(d.sshPass) : null;
        const wifiEncrypted = d.wifiPassword ? encryptPass(d.wifiPassword) : null;

        // Resolve ap_group_id if nodeId provided
        let apGroupId = null;
        if (d.nodeId) {
            apGroupId = await getApGroupIntId(d.nodeId);
            if (!apGroupId && d.nodeName) {
                const byName = await db.get('SELECT id FROM ap_groups WHERE nombre = ?', [d.nodeName]);
                if (byName) apGroupId = byName.id;
            }
        }

        // Build dynamic SET clause — only update fields that are provided
        const sets = [];
        const params = [];

        if (apGroupId !== null) { sets.push('ap_group_id = ?'); params.push(apGroupId); }
        if (d.name || d.deviceName) { sets.push('hostname = ?'); params.push(d.name || d.deviceName); }
        if (d.model !== undefined) { sets.push('modelo = ?'); params.push(d.model || ''); }
        if (d.firmware !== undefined) { sets.push('firmware = ?'); params.push(d.firmware || ''); }
        if (d.ip !== undefined) { sets.push('ip = ?'); params.push(d.ip || ''); }
        if (d.frequency !== undefined) { sets.push('frecuencia_mhz = ?'); params.push(d.frequency || null); }
        if (d.essid !== undefined) { sets.push('ssid = ?'); params.push(d.essid || ''); }
        if (d.channelWidth !== undefined) { sets.push('canal_mhz = ?'); params.push(d.channelWidth || null); }
        if (d.role !== undefined) { sets.push('modo_red = ?'); params.push(d.role === 'sta' ? 'station' : 'ap'); }
        if (d.sshUser !== undefined) { sets.push('usuario_ssh = ?'); params.push(d.sshUser || ''); }
        if (sshEncrypted !== null) { sets.push('clave_ssh_enc = ?'); params.push(sshEncrypted); }
        if (d.sshPort !== undefined) { sets.push('puerto_ssh = ?'); params.push(d.sshPort || 22); }
        if (wifiEncrypted !== null) { sets.push('wifi_password_enc = ?'); params.push(wifiEncrypted); }
        sets.push('cpes_conectados_count = ?'); params.push(cpesCount);
        sets.push('last_saved = ?'); params.push(now);
        sets.push('updated_at = ?'); params.push(now);

        params.push(uuid);
        await db.run(`UPDATE aps SET ${sets.join(', ')} WHERE uuid = ?`, params);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.delete('/db/devices/:id', async (req, res) => {
    try {
        const db = await getDb();
        const uuid = req.params.id; // frontend sends UUID
        await db.run('DELETE FROM aps WHERE uuid = ?', [uuid]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Limpieza basada en la relación Nodos <-> APs (schema v2)
router.post('/db/cleanup-orphan-devices', async (req, res) => {
    try {
        const db = await getDb();

        // v2: nodes tiene columnas directas, no JSON data
        const validNodes = await db.all('SELECT id, ppp_user, nombre_nodo, nombre_vrf FROM nodes');
        if (validNodes.length === 0) {
            return res.json({ success: true, devicesDeleted: 0, cpesDeleted: 0, orphanIds: [], message: 'No hay nodos válidos — limpieza abortada por seguridad' });
        }

        // v2: ap_groups connect APs to logical groupings; find APs whose ap_group_id
        // references a group that no longer exists (orphaned by FK)
        // Since we have ON DELETE CASCADE on ap_group_id, orphans here mean
        // APs whose ap_group_id does not match any existing ap_groups row
        const allAPs = await db.all('SELECT id, uuid, ap_group_id FROM aps');
        const validGroupIds = new Set(
            (await db.all('SELECT id FROM ap_groups')).map(g => g.id)
        );

        const orphans = allAPs.filter(ap => !validGroupIds.has(ap.ap_group_id));

        if (orphans.length === 0) {
            return res.json({ success: true, devicesDeleted: 0, cpesDeleted: 0, orphanIds: [], message: 'No se encontraron APs huérfanos' });
        }

        const orphanIntIds = orphans.map(d => d.id);
        const orphanUuids = orphans.map(d => d.uuid);
        const placeholders = orphanIntIds.map(() => '?').join(',');

        // v2: cpes table with INTEGER ap_id FK
        const cpesResult = await db.run(`DELETE FROM cpes WHERE ap_id IN (${placeholders})`, orphanIntIds);
        const devResult = await db.run(`DELETE FROM aps WHERE id IN (${placeholders})`, orphanIntIds);

        res.json({
            success: true,
            devicesDeleted: devResult.changes,
            cpesDeleted: cpesResult.changes,
            orphanIds: orphanUuids,
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
