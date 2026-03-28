const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { getDb, encryptPass, decryptPass } = require('./db.service');
const { pollAp, getDetail, getFullDetail, clearApCache }  = require('./ap.service');

const genId = () => crypto.randomBytes(8).toString('hex');
const isValidMac = (mac) => /^([0-9a-f]{2}:?){5}([0-9a-f]{2})$/i.test(mac);

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
        if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
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
        // B9: Cascade delete — limpiar historial y nullear ap_id de CPEs huérfanos
        const apIds = aps.map(a => a.id);
        if (apIds.length > 0) {
            const ph = apIds.map(() => '?').join(',');
            await db.run(`DELETE FROM historial_senal WHERE ap_id IN (${ph})`, apIds);
            await db.run(`UPDATE cpes_conocidos SET ap_id=NULL WHERE ap_id IN (${ph})`, apIds);
        }
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
        const enc  = clave_ssh_plain ? encryptPass(clave_ssh_plain) : '';

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
        // B10: Cascade delete — limpiar historial y nullear ap_id de CPEs
        await db.run('DELETE FROM historial_senal WHERE ap_id=?', req.params.id);
        await db.run('UPDATE cpes_conocidos SET ap_id=NULL WHERE ap_id=?', req.params.id);
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

        const stations = await pollAp(ap.id, ap.ip, ap.puerto_ssh, ap.usuario_ssh, pass, ap.firmware || '');

        // B8+B20: UPSERT atómico en transacción — evita race condition y N+1
        await db.run('BEGIN');
        try {
            for (const sta of stations) {
                if (!sta.mac || !isValidMac(sta.mac)) continue;
                const statsJson = JSON.stringify(sta);
                await db.run(
                    `INSERT INTO cpes_conocidos
                     (mac,ap_id,ip_lan,ultima_vez_visto,last_stats,remote_hostname,remote_platform)
                     VALUES (?,?,?,?,?,?,?)
                     ON CONFLICT(mac) DO UPDATE SET
                       ultima_vez_visto=excluded.ultima_vez_visto,
                       ap_id=excluded.ap_id,
                       ip_lan=COALESCE(excluded.ip_lan, ip_lan),
                       last_stats=excluded.last_stats,
                       remote_hostname=COALESCE(excluded.remote_hostname, remote_hostname),
                       remote_platform=COALESCE(excluded.remote_platform, remote_platform)`,
                    [sta.mac, ap.id, sta.lastip || null, Date.now(), statsJson,
                     sta.remote_hostname || null, sta.remote_platform || null]
                );
                if (req.body?.saveHistory) {
                    // B6: sta.distance viene en metros, columna es distancia_km → convertir
                    await db.run(
                        `INSERT INTO historial_senal
                         (cpe_mac,ap_id,timestamp,signal_dbm,remote_signal_dbm,noisefloor_dbm,
                          cinr_db,ccq_pct,distancia_km,downlink_mbps,uplink_mbps,airtime_tx,airtime_rx)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                        [sta.mac, ap.id, Date.now(), sta.signal, sta.remote_signal, sta.noisefloor,
                         sta.airmax_cinr_rx, sta.ccq,
                         sta.distance != null ? Math.round(sta.distance / 1000 * 100) / 100 : null,
                         sta.tx_rate ?? null, sta.rx_rate ?? null,
                         sta.airmax_tx_usage, sta.airmax_rx_usage]
                    );
                }
            }
            await db.run('COMMIT');
        } catch (e) { await db.run('ROLLBACK'); throw e; }

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
            sta.lastip && sta.mac && isValidMac(sta.mac) && !(km[sta.mac]?.hostname) && !sta.cpe_name && ap.usuario_ssh && pass
        );
        if (toEnrich.length > 0) {
            (async () => {
                for (const sta of toEnrich.slice(0, 5)) {  // limitar a 5 para no saturar SSH
                    try {
                        const s = await getDetail(sta.lastip, ap.puerto_ssh || 22, ap.usuario_ssh, pass);
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
                                [sta.mac, ap.id || null, s.deviceName || '', s.deviceModel || '', s.firmwareVersion || '',
                                 sta.lastip, s.lanMac || '', s.wlanMac || '', Date.now()]
                            );
                        }
                    } catch { /* ignore individual failures */ }
                }
            })().catch(err => console.warn('[AP] Auto-enrich error:', err.message));
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

// ── Poll AP directly — usa credenciales del nodo (node_ssh_creds) ────────
router.post('/poll-direct', async (req, res) => {
    try {
        const { apId, ip, port, user, pass, saveHistory, firmware } = req.body;
        if (!apId || !ip) return res.status(400).json({ success: false, message: 'apId e ip requeridos' });

        // Buscar credenciales del nodo al que pertenece el AP
        let sshUser = user || '';
        let sshPass = pass || '';
        try {
            const db = await getDb();
            const devRow = await db.get('SELECT data FROM devices WHERE id = ?', [apId]);
            if (devRow) {
                const dev = JSON.parse(devRow.data);
                const nodeId = dev.nodeId;
                if (nodeId) {
                    const credsRow = await db.get(
                        'SELECT ssh_creds, ssh_user, ssh_pass FROM node_ssh_creds WHERE ppp_user = ?',
                        [nodeId]
                    );
                    if (credsRow) {
                        let credList = [];
                        if (credsRow.ssh_creds && credsRow.ssh_creds !== '[]') {
                            credList = JSON.parse(credsRow.ssh_creds)
                                .map(c => ({ user: c.user || '', pass: decryptPass(c.encPass) }));
                        } else if (credsRow.ssh_user) {
                            credList = [{ user: credsRow.ssh_user, pass: decryptPass(credsRow.ssh_pass) }];
                        }
                        if (credList.length > 0) { sshUser = credList[0].user; sshPass = credList[0].pass; }
                    }
                }
            }
        } catch (e) {
            console.warn('[poll-direct] Error buscando credenciales del nodo:', e.message);
        }

        const stations = await pollAp(apId, ip, parseInt(port) || 22, sshUser, sshPass, firmware || '');
        const db = await getDb();

        // B8+B17+B20: UPSERT atómico + validación MAC + transacción batch
        await db.run('BEGIN');
        try {
            for (const sta of stations) {
                if (!sta.mac || !isValidMac(sta.mac)) continue;
                const statsJson = JSON.stringify(sta);
                await db.run(
                    `INSERT INTO cpes_conocidos
                     (mac,ap_id,ip_lan,ultima_vez_visto,last_stats,remote_hostname,remote_platform)
                     VALUES (?,?,?,?,?,?,?)
                     ON CONFLICT(mac) DO UPDATE SET
                       ultima_vez_visto=excluded.ultima_vez_visto,
                       ap_id=excluded.ap_id,
                       ip_lan=COALESCE(excluded.ip_lan, ip_lan),
                       last_stats=excluded.last_stats,
                       remote_hostname=COALESCE(excluded.remote_hostname, remote_hostname),
                       remote_platform=COALESCE(excluded.remote_platform, remote_platform)`,
                    [sta.mac, apId, sta.lastip || null, Date.now(), statsJson,
                     sta.remote_hostname || null, sta.remote_platform || null]
                );
                if (saveHistory) {
                    // B6: sta.distance viene en metros, columna es distancia_km → convertir
                    await db.run(
                        `INSERT INTO historial_senal
                         (cpe_mac,ap_id,timestamp,signal_dbm,remote_signal_dbm,noisefloor_dbm,
                          cinr_db,ccq_pct,distancia_km,downlink_mbps,uplink_mbps,airtime_tx,airtime_rx)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                        [sta.mac, apId, Date.now(), sta.signal, sta.remote_signal, sta.noisefloor,
                         sta.airmax_cinr_rx, sta.ccq,
                         sta.distance != null ? Math.round(sta.distance / 1000 * 100) / 100 : null,
                         sta.tx_rate ?? null, sta.rx_rate ?? null,
                         sta.airmax_tx_usage, sta.airmax_rx_usage]
                    );
                }
            }
            await db.run('COMMIT');
        } catch (e) { await db.run('ROLLBACK'); throw e; }

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
    } catch (e) { res.json({ success: false, message: e.message }); }
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

// ── CPE detail direct — usa credenciales del nodo (node_ssh_creds) ────────
router.post('/cpes/:mac/detail-direct', async (req, res) => {
    try {
        const { cpe_ip, port, user, pass, apId } = req.body;
        if (!cpe_ip) return res.status(400).json({ success: false, message: 'cpe_ip requerido' });

        // Buscar credenciales del nodo al que pertenece el AP
        let credList = [];
        if (apId) {
            try {
                const db = await getDb();
                const devRow = await db.get('SELECT data FROM devices WHERE id = ?', [apId]);
                if (devRow) {
                    const dev = JSON.parse(devRow.data);
                    const nodeId = dev.nodeId; // nodeId === ppp_user en la tabla nodes
                    if (nodeId) {
                        const credsRow = await db.get(
                            'SELECT ssh_creds, ssh_user, ssh_pass FROM node_ssh_creds WHERE ppp_user = ?',
                            [nodeId]
                        );
                        if (credsRow) {
                            if (credsRow.ssh_creds && credsRow.ssh_creds !== '[]') {
                                credList = JSON.parse(credsRow.ssh_creds)
                                    .map(c => ({ user: c.user || '', pass: decryptPass(c.encPass) }));
                            } else if (credsRow.ssh_user) {
                                credList = [{ user: credsRow.ssh_user, pass: decryptPass(credsRow.ssh_pass) }];
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[detail-direct] Error buscando credenciales del nodo:', e.message);
            }
        }
        // Fallback: credenciales enviadas por el frontend
        if (credList.length === 0) credList = [{ user: user || '', pass: pass || '' }];

        const sshPort = parseInt(port) || 22;
        let s = null, lastError = null;
        for (const cred of credList) {
            try {
                s = await getDetail(cpe_ip, sshPort, cred.user, cred.pass);
                break;
            } catch (e) {
                lastError = e;
                console.warn(`[detail-direct] Credencial '${cred.user}' fallida: ${e.message}`);
            }
        }
        if (!s) throw lastError || new Error('Sin credenciales válidas');
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

// ── Poll masivo — pollea todos los APs activos del AP Monitor ────────────
// Actualiza last_stats en cpes_conocidos para cada CPE visible.
// Usado por el botón "Actualizar" de la topología.
router.post('/poll-all-monitor', async (req, res) => {
    try {
        const db  = await getDb();
        const aps = await db.all('SELECT * FROM aps WHERE activo = 1');
        let ok = 0, fail = 0;

        // B3: Limitar concurrencia a 3 APs simultáneos para evitar SQLITE_BUSY
        const BATCH_SIZE = 3;
        for (let i = 0; i < aps.length; i += BATCH_SIZE) {
            await Promise.allSettled(aps.slice(i, i + BATCH_SIZE).map(async (ap) => {
                try {
                    const pass     = decryptPass(ap.clave_ssh);
                    const stations = await pollAp(ap.id, ap.ip, ap.puerto_ssh, ap.usuario_ssh, pass, ap.firmware || '');

                    await db.run('BEGIN');
                    try {
                        for (const sta of stations) {
                            if (!sta.mac || !isValidMac(sta.mac)) continue;
                            const statsJson = JSON.stringify(sta);
                            // B8: UPSERT atómico — evita race condition SELECT-then-INSERT
                            await db.run(
                                `INSERT INTO cpes_conocidos
                                 (mac,ap_id,ip_lan,ultima_vez_visto,last_stats,remote_hostname,remote_platform)
                                 VALUES (?,?,?,?,?,?,?)
                                 ON CONFLICT(mac) DO UPDATE SET
                                   ultima_vez_visto=excluded.ultima_vez_visto,
                                   ap_id=excluded.ap_id,
                                   ip_lan=COALESCE(excluded.ip_lan, ip_lan),
                                   last_stats=excluded.last_stats,
                                   remote_hostname=COALESCE(excluded.remote_hostname, remote_hostname),
                                   remote_platform=COALESCE(excluded.remote_platform, remote_platform)`,
                                [sta.mac, ap.id, sta.lastip || null, Date.now(), statsJson,
                                 sta.remote_hostname || null, sta.remote_platform || null]
                            );
                        }
                        await db.run('COMMIT');
                    } catch (e) { await db.run('ROLLBACK'); throw e; }
                    ok++;
                } catch { fail++; }
            }));
        }

        res.json({ success: true, ok, fail, total: aps.length });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Helper: verifica si una IP cae dentro de un CIDR ──────────────────────
function ipInCidr(ip, cidr) {
    if (!ip || !cidr) return false;
    try {
        const [net, bits] = cidr.split('/');
        if (!net || !bits) return false;
        const b = 32 - parseInt(bits);
        const mask = b >= 32 ? 0 : ~((1 << b) - 1) >>> 0;
        const toInt = s => s.split('.').reduce((a, o) => ((a << 8) >>> 0) + parseInt(o), 0) >>> 0;
        return (toInt(ip) & mask) === (toInt(net) & mask);
    } catch { return false; }
}

// ── CPEs para Topología — CPEs conocidos con AP info y último señal ───────
// El ap_id en cpes_conocidos puede ser:
//   a) ID de la tabla aps (AP Monitor)  → 16 chars hex
//   b) MAC sin separadores del device   → 12 chars hex (poll-direct)
// Se resuelven ambos casos para obtener la IP del AP y así ligar al nodo VPN.
router.get('/topology-cpes', async (req, res) => {
    try {
        const db = await getDb();

        // 1. Todos los CPEs con ap_id asignado
        const cpes = await db.all(`
            SELECT mac, hostname, modelo, firmware,
                   ip_lan, mac_wlan, mac_ap, ssid_ap,
                   frecuencia_mhz, ultima_vez_visto, ap_id,
                   last_stats, remote_hostname, remote_platform
            FROM cpes_conocidos
            WHERE ap_id IS NOT NULL AND ap_id != ''
            ORDER BY ultima_vez_visto DESC
        `);

        if (cpes.length === 0) { return res.json({ success: true, cpes: [] }); }

        // 2. Resolver AP ip para cada ap_id único
        const apIds = [...new Set(cpes.map(c => c.ap_id))];

        // a) Buscar en tabla aps del AP Monitor
        const apsPh   = apIds.map(() => '?').join(',');
        const apsRows = await db.all(
            `SELECT id, ip, hostname, ssid, nodo_id FROM aps WHERE id IN (${apsPh})`,
            apIds
        );

        // b) Buscar en tabla devices (ap_id = MAC del device, 12 chars hex)
        const macIds   = apIds.filter(id => /^[0-9A-Fa-f]{12}$/.test(id));
        let devRows = [];
        if (macIds.length > 0) {
            const devPh = macIds.map(() => '?').join(',');
            const raw   = await db.all(
                `SELECT id, data FROM devices WHERE id IN (${devPh})`,
                macIds
            );
            devRows = raw.map(r => {
                try {
                    const d = JSON.parse(r.data);
                    return { id: r.id, ip: d.ip || '', hostname: d.name || '', nodeId: d.nodeId || '' };
                } catch { return { id: r.id, ip: '', hostname: '', nodeId: '' }; }
            });
        }

        // Cargar nodos VPN para resolver nodeId por subred (segmento_lan)
        const vpnNodeRows = await db.all('SELECT data FROM nodes');
        const vpnNodes = vpnNodeRows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

        // Helper: dada una IP, devuelve el ppp_user del nodo VPN cuya subred la contiene
        const nodeIdByIp = (ip) => {
            if (!ip) return null;
            for (const n of vpnNodes) {
                if (n.segmento_lan && ipInCidr(ip, n.segmento_lan)) return n.ppp_user || null;
            }
            return null;
        };

        // Mapa ap_id → { ip, hostname, nodeId }
        const apMap = {};
        apsRows.forEach(a => {
            const nodeId = nodeIdByIp(a.ip);
            apMap[a.id] = { ip: a.ip, hostname: a.hostname || a.ssid || '', nodeId };
        });
        devRows.forEach(d => { apMap[d.id] = { ip: d.ip, hostname: d.hostname, nodeId: d.nodeId }; });

        // 3. Última señal por CPE
        const macs  = cpes.map(c => c.mac).filter(Boolean);
        const sigMap = {};
        if (macs.length > 0) {
            const ph  = macs.map(() => '?').join(',');
            const rows = await db.all(`
                SELECT h.cpe_mac, h.signal_dbm, h.noisefloor_dbm, h.ccq_pct,
                       h.downlink_mbps, h.uplink_mbps, h.distancia_km, h.timestamp
                FROM historial_senal h
                INNER JOIN (
                    SELECT cpe_mac, MAX(timestamp) AS ts
                    FROM historial_senal WHERE cpe_mac IN (${ph})
                    GROUP BY cpe_mac
                ) lts ON h.cpe_mac = lts.cpe_mac AND h.timestamp = lts.ts
            `, macs);
            rows.forEach(r => { sigMap[r.cpe_mac] = r; });
        }

        const result = cpes.map(c => {
            const apInfo = apMap[c.ap_id] || {};
            // Si el AP no resolvió nodeId, intentar por IP del CPE directamente
            const nodeId = apInfo.nodeId || nodeIdByIp(c.ip_lan) || null;
            return {
                ...c,
                ap_ip:       apInfo.ip       || null,
                ap_hostname: apInfo.hostname || null,
                ap_nodeId:   nodeId,
                lastSignal:  sigMap[c.mac]   || null,
            };
        });

        res.json({ success: true, cpes: result });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
