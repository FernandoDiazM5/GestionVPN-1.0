const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { getDb, encryptPass, decryptPass } = require('./db.service');
const { pollAp, getDetail, getFullDetail, clearApCache }  = require('./ap.service');

const genId = () => crypto.randomBytes(8).toString('hex');

// ── Nodos ─────────────────────────────────────────────────────────────────
router.get('/nodos', async (req, res) => {
    try {
        const db   = await getDb();
        const rows = await db.all('SELECT * FROM ap_nodos ORDER BY creado_en DESC');
        const counts = await db.all('SELECT nodo_id, COUNT(*) as c FROM aps GROUP BY nodo_id');
        const cm = {}; counts.forEach(r => { cm[r.nodo_id] = r.c; });
        res.json({ success: true, nodos: rows.map(r => ({ ...r, ap_count: cm[r.id] || 0 })) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/nodos', async (req, res) => {
    try {
        const { nombre, descripcion, ubicacion } = req.body;
        if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
        const db = await getDb();
        const id = genId();
        await db.run('INSERT INTO ap_nodos (id,nombre,descripcion,ubicacion,creado_en) VALUES (?,?,?,?,?)',
            [id, nombre, descripcion || '', ubicacion || '', Date.now()]);
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/nodos/:id', async (req, res) => {
    try {
        const { nombre, descripcion, ubicacion } = req.body;
        const db = await getDb();
        await db.run('UPDATE ap_nodos SET nombre=?,descripcion=?,ubicacion=? WHERE id=?',
            [nombre, descripcion || '', ubicacion || '', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/nodos/:id', async (req, res) => {
    try {
        const db = await getDb();
        const aps = await db.all('SELECT id FROM aps WHERE nodo_id=?', req.params.id);
        aps.forEach(ap => clearApCache(ap.id));
        await db.run('DELETE FROM aps WHERE nodo_id=?', req.params.id);
        await db.run('DELETE FROM ap_nodos WHERE id=?', req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── APs ───────────────────────────────────────────────────────────────────
router.get('/nodos/:nodeId/aps', async (req, res) => {
    try {
        const db   = await getDb();
        const rows = await db.all('SELECT * FROM aps WHERE nodo_id=? ORDER BY registrado_en DESC', req.params.nodeId);
        // Strip encrypted password — never send to frontend
        res.json({ success: true, aps: rows.map(r => { const { clave_ssh, ...safe } = r; return safe; }) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Register AP — tries SSH immediately to pull static config
router.post('/aps', async (req, res) => {
    try {
        const { nodo_id, ip, usuario_ssh, clave_ssh_plain, puerto_ssh } = req.body;
        if (!nodo_id || !ip) return res.status(400).json({ success: false, message: 'nodo_id e ip requeridos' });
        const db   = await getDb();
        const id   = genId();
        const port = parseInt(puerto_ssh) || 22;
        const enc  = encryptPass(clave_ssh_plain);

        let hostname = '', modelo = '', firmware = '', mac_lan = '', mac_wlan = '',
            frecuencia_ghz = null, ssid = '', canal_mhz = null, tx_power = null, modo_red = '';

        if (usuario_ssh && clave_ssh_plain) {
            try {
                const s = await getDetail(ip, port, usuario_ssh, clave_ssh_plain);
                hostname      = s.deviceName      || '';
                modelo        = s.deviceModel     || '';
                firmware      = s.firmwareVersion || '';
                mac_lan       = s.lanMac          || '';
                mac_wlan      = s.wlanMac         || '';
                frecuencia_ghz = s.frequency ? parseFloat((s.frequency / 1000).toFixed(3)) : null;
                ssid          = s.essid           || '';
                canal_mhz     = s.channelWidth    || null;
                tx_power      = s.txPower         || null;
                modo_red      = s.networkMode     || '';
            } catch (sshErr) {
                console.warn('[AP Routes] SSH on register failed:', sshErr.message);
            }
        }

        await db.run(
            `INSERT INTO aps (id,nodo_id,hostname,modelo,firmware,mac_lan,mac_wlan,ip,
             frecuencia_ghz,ssid,canal_mhz,tx_power,modo_red,usuario_ssh,clave_ssh,puerto_ssh,activo,registrado_en)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
            [id, nodo_id, hostname, modelo, firmware, mac_lan, mac_wlan, ip,
             frecuencia_ghz, ssid, canal_mhz, tx_power, modo_red,
             usuario_ssh || '', enc, port, Date.now()]
        );
        res.json({ success: true, id, hostname, modelo, firmware, ssid, mac_wlan, frecuencia_ghz });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/aps/:id', async (req, res) => {
    try {
        const { ip, usuario_ssh, clave_ssh_plain, puerto_ssh, activo } = req.body;
        const db = await getDb();
        const ap = await db.get('SELECT * FROM aps WHERE id=?', req.params.id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const enc = clave_ssh_plain ? encryptPass(clave_ssh_plain) : ap.clave_ssh;
        await db.run('UPDATE aps SET ip=?,usuario_ssh=?,clave_ssh=?,puerto_ssh=?,activo=? WHERE id=?',
            [ip || ap.ip, usuario_ssh || ap.usuario_ssh, enc,
             parseInt(puerto_ssh) || ap.puerto_ssh, activo != null ? activo : ap.activo, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/aps/:id', async (req, res) => {
    try {
        const db = await getDb();
        clearApCache(req.params.id);
        await db.run('DELETE FROM aps WHERE id=?', req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Refresh AP static data (re-SSH) ──────────────────────────────────────
router.post('/aps/:id/refresh', async (req, res) => {
    try {
        const db = await getDb();
        const ap = await db.get('SELECT * FROM aps WHERE id=?', req.params.id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const pass = decryptPass(ap.clave_ssh);
        const s = await getDetail(ap.ip, ap.puerto_ssh, ap.usuario_ssh, pass);
        await db.run(
            `UPDATE aps SET hostname=?,modelo=?,firmware=?,mac_lan=?,mac_wlan=?,
             frecuencia_ghz=?,ssid=?,canal_mhz=?,tx_power=?,modo_red=? WHERE id=?`,
            [s.deviceName || ap.hostname, s.deviceModel || ap.modelo,
             s.firmwareVersion || ap.firmware, s.lanMac || ap.mac_lan, s.wlanMac || ap.mac_wlan,
             s.frequency ? parseFloat((s.frequency / 1000).toFixed(3)) : ap.frecuencia_ghz,
             s.essid || ap.ssid, s.channelWidth || ap.canal_mhz,
             s.txPower || ap.tx_power, s.networkMode || ap.modo_red, req.params.id]
        );
        res.json({ success: true, stats: s });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Poll AP → wstalist (real-time) ────────────────────────────────────────
router.post('/aps/:id/poll', async (req, res) => {
    try {
        const db = await getDb();
        const ap = await db.get('SELECT * FROM aps WHERE id=?', req.params.id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const pass = decryptPass(ap.clave_ssh);

        const stations = await pollAp(ap.id, ap.ip, ap.puerto_ssh, ap.usuario_ssh, pass);

        // Update / insert cpes_conocidos minimal records
        for (const sta of stations) {
            if (!sta.mac) continue;
            const exists = await db.get('SELECT mac FROM cpes_conocidos WHERE mac=?', sta.mac);
            if (exists) {
                await db.run('UPDATE cpes_conocidos SET ultima_vez_visto=?,ap_id=?,ip_lan=COALESCE(?,ip_lan) WHERE mac=?',
                    [Date.now(), ap.id, sta.lastip || null, sta.mac]);
            } else {
                await db.run('INSERT OR IGNORE INTO cpes_conocidos (mac,ap_id,ip_lan,ultima_vez_visto) VALUES (?,?,?,?)',
                    [sta.mac, ap.id, sta.lastip || null, Date.now()]);
            }

            // Optional history snapshot
            if (req.body?.saveHistory) {
                await db.run(
                    `INSERT INTO historial_senal
                     (cpe_mac,ap_id,timestamp,signal_dbm,remote_signal_dbm,noisefloor_dbm,
                      cinr_db,ccq_pct,distancia_km,downlink_mbps,uplink_mbps,airtime_tx,airtime_rx)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [sta.mac, ap.id, Date.now(), sta.signal, sta.rssi, sta.noisefloor,
                     sta.cinr, sta.ccq, sta.distance,
                     sta.tx_rate ? sta.tx_rate / 1000 : null,
                     sta.rx_rate ? sta.rx_rate / 1000 : null,
                     sta.airtime_tx, sta.airtime_rx]
                );
            }
        }

        // Enrich with known CPE names
        const macs = stations.map(s => s.mac).filter(Boolean);
        const known = macs.length > 0
            ? await db.all(`SELECT * FROM cpes_conocidos WHERE mac IN (${macs.map(() => '?').join(',')})`, macs)
            : [];
        const km = {}; known.forEach(k => { km[k.mac] = k; });

        const enriched = stations.map(sta => ({
            ...sta,
            hostname: km[sta.mac]?.hostname || sta.cpe_name || null,
            modelo:   km[sta.mac]?.modelo   || sta.cpe_product || null,
            isKnown:  !!(km[sta.mac]?.hostname || sta.cpe_name),
        }));

        // Auto-enrich new CPEs without hostname (fire-and-forget, non-blocking)
        const toEnrich = stations.filter(sta =>
            sta.lastip && sta.mac && !(km[sta.mac]?.hostname) && !sta.cpe_name && user && pass
        );
        if (toEnrich.length > 0) {
            (async () => {
                for (const sta of toEnrich) {
                    try {
                        const s = await getDetail(sta.lastip, parseInt(port) || 22, user, pass);
                        if (s.deviceName || s.deviceModel) {
                            await db.run(
                                `INSERT INTO cpes_conocidos (mac,ap_id,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,ultima_vez_visto)
                                 VALUES (?,?,?,?,?,?,?,?,?)
                                 ON CONFLICT(mac) DO UPDATE SET
                                   hostname=COALESCE(excluded.hostname, hostname),
                                   modelo=COALESCE(excluded.modelo, modelo),
                                   firmware=COALESCE(excluded.firmware, firmware),
                                   ip_lan=excluded.ip_lan,
                                   mac_lan=COALESCE(excluded.mac_lan, mac_lan),
                                   mac_wlan=COALESCE(excluded.mac_wlan, mac_wlan),
                                   ultima_vez_visto=excluded.ultima_vez_visto`,
                                [sta.mac, apId || null, s.deviceName || '', s.deviceModel || '', s.firmwareVersion || '',
                                 sta.lastip, s.lanMac || '', s.wlanMac || '', Date.now()]
                            );
                        }
                    } catch { /* ignore individual failures */ }
                }
            })();
        }

        res.json({ success: true, stations: enriched, polledAt: Date.now() });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── CPE detail — SSH on demand ────────────────────────────────────────────
router.post('/cpes/:mac/detail', async (req, res) => {
    try {
        const { ap_id, cpe_ip } = req.body;
        if (!ap_id || !cpe_ip) return res.status(400).json({ success: false, message: 'ap_id y cpe_ip requeridos' });

        const db = await getDb();
        const ap = await db.get('SELECT * FROM aps WHERE id=?', ap_id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const pass = decryptPass(ap.clave_ssh);

        const s = await getDetail(cpe_ip, ap.puerto_ssh, ap.usuario_ssh, pass);
        const mac = req.params.mac.toUpperCase();

        // Save/update cpes_conocidos
        await db.run(
            `INSERT INTO cpes_conocidos
             (mac,ap_id,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,mac_ap,
              modo_red,frecuencia_mhz,canal_mhz,tx_power,ssid_ap,ultima_vez_visto)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(mac) DO UPDATE SET
               hostname=excluded.hostname, modelo=excluded.modelo, firmware=excluded.firmware,
               ip_lan=excluded.ip_lan, mac_lan=excluded.mac_lan, mac_wlan=excluded.mac_wlan,
               mac_ap=excluded.mac_ap, modo_red=excluded.modo_red,
               frecuencia_mhz=excluded.frecuencia_mhz, canal_mhz=excluded.canal_mhz,
               tx_power=excluded.tx_power, ssid_ap=excluded.ssid_ap,
               ultima_vez_visto=excluded.ultima_vez_visto`,
            [mac, ap_id,
             s.deviceName || '', s.deviceModel || '', s.firmwareVersion || '',
             cpe_ip, s.lanMac || '', s.wlanMac || '', s.apMac || '',
             s.networkMode || '', s.frequency || null, s.channelWidth || null,
             s.txPower || null, s.essid || '', Date.now()]
        );

        res.json({ success: true, stats: { ...s, ip: cpe_ip } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── CPEs DB ───────────────────────────────────────────────────────────────
router.get('/cpes', async (req, res) => {
    try {
        const db  = await getDb();
        const cpes = await db.all('SELECT * FROM cpes_conocidos ORDER BY ultima_vez_visto DESC');
        res.json({ success: true, cpes });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Signal history ────────────────────────────────────────────────────────
router.get('/historial/:mac', async (req, res) => {
    try {
        const db    = await getDb();
        const limit = parseInt(req.query.limit) || 100;
        const rows  = await db.all(
            'SELECT * FROM historial_senal WHERE cpe_mac=? ORDER BY timestamp DESC LIMIT ?',
            [req.params.mac.toUpperCase(), limit]
        );
        res.json({ success: true, historial: rows.reverse() });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Poll AP directly (no DB lookup — uses SavedDevice SSH creds) ──────────
router.post('/poll-direct', async (req, res) => {
    try {
        const { apId, ip, port, user, pass, saveHistory } = req.body;
        if (!apId || !ip) return res.status(400).json({ success: false, message: 'apId e ip requeridos' });

        const stations = await pollAp(apId, ip, parseInt(port) || 22, user || '', pass || '');
        const db = await getDb();

        for (const sta of stations) {
            if (!sta.mac) continue;
            const exists = await db.get('SELECT mac FROM cpes_conocidos WHERE mac=?', sta.mac);
            if (exists) {
                await db.run('UPDATE cpes_conocidos SET ultima_vez_visto=?,ap_id=?,ip_lan=COALESCE(?,ip_lan) WHERE mac=?',
                    [Date.now(), apId, sta.lastip || null, sta.mac]);
            } else {
                await db.run('INSERT OR IGNORE INTO cpes_conocidos (mac,ap_id,ip_lan,ultima_vez_visto) VALUES (?,?,?,?)',
                    [sta.mac, apId, sta.lastip || null, Date.now()]);
            }
            if (saveHistory) {
                await db.run(
                    `INSERT INTO historial_senal
                     (cpe_mac,ap_id,timestamp,signal_dbm,remote_signal_dbm,noisefloor_dbm,
                      cinr_db,ccq_pct,distancia_km,downlink_mbps,uplink_mbps,airtime_tx,airtime_rx)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [sta.mac, apId, Date.now(), sta.signal, sta.rssi, sta.noisefloor,
                     sta.cinr, sta.ccq, sta.distance,
                     sta.tx_rate ? sta.tx_rate / 1000 : null,
                     sta.rx_rate ? sta.rx_rate / 1000 : null,
                     sta.airtime_tx, sta.airtime_rx]
                );
            }
        }

        const macs = stations.map(s => s.mac).filter(Boolean);
        const known = macs.length > 0
            ? await db.all(`SELECT * FROM cpes_conocidos WHERE mac IN (${macs.map(() => '?').join(',')})`, macs)
            : [];
        const km = {}; known.forEach(k => { km[k.mac] = k; });

        const enriched = stations.map(sta => ({
            ...sta,
            hostname: km[sta.mac]?.hostname || null,
            modelo:   km[sta.mac]?.modelo   || null,
            isKnown:  !!(km[sta.mac]?.hostname),
        }));

        res.json({ success: true, stations: enriched, polledAt: Date.now() });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Full AP detail direct — all 12 SSH sections (ANTENNA_CMD) ────────────
router.post('/ap-detail-direct', async (req, res) => {
    try {
        const { ip, port, user, pass } = req.body;
        if (!ip || !user || !pass) return res.status(400).json({ success: false, message: 'ip, user y pass requeridos' });
        const s = await getFullDetail(ip, parseInt(port) || 22, user, pass);
        res.json({ success: true, stats: s });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Batch CPE enrich — SSH to multiple CPEs to get hostname/model ─────────
router.post('/cpes/enrich-batch', async (req, res) => {
    try {
        const { cpes, port, user, pass } = req.body;
        // cpes: [{ mac, ip }]
        if (!Array.isArray(cpes) || !user || !pass) return res.status(400).json({ success: false, message: 'cpes[], user, pass requeridos' });
        const db = await getDb();
        const results = [];
        for (const { mac, ip } of cpes) {
            if (!mac || !ip) continue;
            try {
                const s = await getDetail(ip, parseInt(port) || 22, user, pass);
                const MAC = mac.toUpperCase();
                await db.run(
                    `INSERT INTO cpes_conocidos (mac,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,ultima_vez_visto)
                     VALUES (?,?,?,?,?,?,?,?)
                     ON CONFLICT(mac) DO UPDATE SET
                       hostname=COALESCE(excluded.hostname, hostname),
                       modelo=COALESCE(excluded.modelo, modelo),
                       firmware=COALESCE(excluded.firmware, firmware),
                       ip_lan=excluded.ip_lan,
                       mac_lan=COALESCE(excluded.mac_lan, mac_lan),
                       mac_wlan=COALESCE(excluded.mac_wlan, mac_wlan),
                       ultima_vez_visto=excluded.ultima_vez_visto`,
                    [MAC, s.deviceName || '', s.deviceModel || '', s.firmwareVersion || '',
                     ip, s.lanMac || '', s.wlanMac || '', Date.now()]
                );
                results.push({ mac: MAC, ok: true, hostname: s.deviceName, modelo: s.deviceModel });
            } catch (err) {
                results.push({ mac, ok: false, error: err.message });
            }
        }
        res.json({ success: true, results });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── CPE detail direct (no DB AP lookup — uses provided SSH creds) ─────────
router.post('/cpes/:mac/detail-direct', async (req, res) => {
    try {
        const { cpe_ip, port, user, pass, apId } = req.body;
        if (!cpe_ip) return res.status(400).json({ success: false, message: 'cpe_ip requerido' });

        const s = await getDetail(cpe_ip, parseInt(port) || 22, user || '', pass || '');
        const mac = req.params.mac.toUpperCase();
        const db = await getDb();

        await db.run(
            `INSERT INTO cpes_conocidos
             (mac,ap_id,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,mac_ap,
              modo_red,frecuencia_mhz,canal_mhz,tx_power,ssid_ap,ultima_vez_visto)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(mac) DO UPDATE SET
               hostname=excluded.hostname, modelo=excluded.modelo, firmware=excluded.firmware,
               ip_lan=excluded.ip_lan, mac_lan=excluded.mac_lan, mac_wlan=excluded.mac_wlan,
               mac_ap=excluded.mac_ap, modo_red=excluded.modo_red,
               frecuencia_mhz=excluded.frecuencia_mhz, canal_mhz=excluded.canal_mhz,
               tx_power=excluded.tx_power, ssid_ap=excluded.ssid_ap,
               ultima_vez_visto=excluded.ultima_vez_visto`,
            [mac, apId || null,
             s.deviceName || '', s.deviceModel || '', s.firmwareVersion || '',
             cpe_ip, s.lanMac || '', s.wlanMac || '', s.apMac || '',
             s.networkMode || '', s.frequency || null, s.channelWidth || null,
             s.txPower || null, s.essid || '', Date.now()]
        );

        res.json({ success: true, stats: { ...s, ip: cpe_ip } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
