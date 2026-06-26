const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { getDb, encryptPass, decryptPass, getApIntId, getCpeIntId, getApGroupIntId, getNodeByPppUser, getAppSetting } = require('./db.service');
const { pollAp, getDetail, getFullDetail, clearApCache }  = require('./ap.service');

const { reqWorkspace, ownedGroupIntIds, ownedApIntIds, ownsGroupUuid, ownsApUuid, cpeForeign } = require('./lib/tenantScope');
const { ipInCidr, resolveOwnerNodeId, resolveNodeCreds: resolveNodeCredsShared } = require('./lib/apNode');
const apWatch = require('./lib/apWatch');
const scanIpRepo = require('./db/repos/scanIpRepo');
const scanMangle = require('./lib/scanMangle');
const scanLock = require('./lib/scanLock');
const log = require('./lib/logger').child({ scope: 'ap-routes' });

const genUuid = () => crypto.randomBytes(8).toString('hex');
const isValidMac = (mac) => /^([0-9a-f]{2}:?){5}([0-9a-f]{2})$/i.test(mac);

// C3 (Fase 2): delega en el helper compartido (lib/apNode), inyectando decryptPass.
const resolveNodeCreds = (db, apRow) => resolveNodeCredsShared(db, apRow, decryptPass);

// Credenciales del router core (igual que apPollJob). null si faltan.
async function loadMikrotik() {
  try {
    const ip = await getAppSetting('MT_IP');
    const user = await getAppSetting('MT_USER');
    const passEnc = await getAppSetting('MT_PASS');
    return (ip && user && passEnc) ? { ip, user, pass: decryptPass(passEnc) } : null;
  } catch (_) { return null; }
}

// ── Nodos (ap_groups) ────────────────────────────────────────────────────
router.get('/nodos', async (req, res) => {
    try {
        const db   = await getDb();
        const gids = await ownedGroupIntIds(db, req);   // null = admin (todos)
        let rows;
        if (gids === null) {
            rows = await db.all('SELECT * FROM ap_groups ORDER BY created_at DESC');
        } else if (gids.length === 0) {
            rows = [];
        } else {
            const ph = gids.map(() => '?').join(',');
            rows = await db.all(`SELECT * FROM ap_groups WHERE id IN (${ph}) ORDER BY created_at DESC`, gids);
        }
        const counts = await db.all('SELECT ap_group_id, COUNT(*) as c FROM aps GROUP BY ap_group_id');
        const cm = {}; counts.forEach(r => { cm[r.ap_group_id] = r.c; });
        res.json({ success: true, nodos: rows.map(r => ({ ...r, id: r.uuid, ap_count: cm[r.id] || 0 })) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/nodos', async (req, res) => {
    try {
        const { nombre, descripcion, ubicacion } = req.body;
        if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
        const db = await getDb();
        const uuid = genUuid();
        const ws = reqWorkspace(req);
        await db.run('INSERT INTO ap_groups (uuid,nombre,descripcion,ubicacion,workspace_id,created_at) VALUES (?,?,?,?,?,?)',
            [uuid, nombre, descripcion || '', ubicacion || '', ws, Date.now()]);
        res.json({ success: true, id: uuid });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/nodos/:id', async (req, res) => {
    try {
        const { nombre, descripcion, ubicacion } = req.body;
        if (!nombre) return res.status(400).json({ success: false, message: 'Nombre requerido' });
        const db = await getDb();
        if (!(await ownsGroupUuid(db, req, req.params.id))) return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
        await db.run('UPDATE ap_groups SET nombre=?,descripcion=?,ubicacion=?,updated_at=? WHERE uuid=?',
            [nombre, descripcion || '', ubicacion || '', Date.now(), req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/nodos/:id', async (req, res) => {
    try {
        const db = await getDb();
        if (!(await ownsGroupUuid(db, req, req.params.id))) return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
        const groupIntId = await getApGroupIntId(req.params.id);
        if (!groupIntId) return res.status(404).json({ success: false, message: 'Grupo no encontrado' });

        const aps = await db.all('SELECT id, uuid FROM aps WHERE ap_group_id=?', groupIntId);
        aps.forEach(ap => clearApCache(ap.uuid));

        // B9: Cascade delete — limpiar historial y nullear ap_id de CPEs huerfanos
        const apIntIds = aps.map(a => a.id);
        if (apIntIds.length > 0) {
            const ph = apIntIds.map(() => '?').join(',');
            await db.run(`DELETE FROM signal_history WHERE ap_id IN (${ph})`, apIntIds);
            await db.run(`UPDATE cpes SET ap_id=NULL WHERE ap_id IN (${ph})`, apIntIds);
        }
        await db.run('DELETE FROM aps WHERE ap_group_id=?', groupIntId);
        await db.run('DELETE FROM ap_groups WHERE id=?', groupIntId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── APs ───────────────────────────────────────────────────────────────────
router.get('/nodos/:nodeId/aps', async (req, res) => {
    try {
        const db = await getDb();
        if (!(await ownsGroupUuid(db, req, req.params.nodeId))) return res.json({ success: true, aps: [] });
        const groupIntId = await getApGroupIntId(req.params.nodeId);
        if (!groupIntId) return res.json({ success: true, aps: [] });
        const rows = await db.all('SELECT * FROM aps WHERE ap_group_id=? ORDER BY created_at DESC', groupIntId);
        // Strip encrypted password — never send to frontend
        res.json({ success: true, aps: rows.map(r => { const { clave_ssh_enc, ...safe } = r; return { ...safe, id: r.uuid }; }) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Register AP — tries SSH immediately to pull static config
router.post('/aps', async (req, res) => {
    try {
        const { nodo_id, ip, usuario_ssh, clave_ssh_plain, puerto_ssh } = req.body;
        if (!nodo_id || !ip) return res.status(400).json({ success: false, message: 'nodo_id e ip requeridos' });
        const db   = await getDb();
        const uuid = genUuid();
        const port = parseInt(puerto_ssh) || 22;
        const enc  = clave_ssh_plain ? encryptPass(clave_ssh_plain) : '';

        // Resolve ap_group_id from the uuid sent by frontend (debe pertenecer al workspace)
        if (!(await ownsGroupUuid(db, req, nodo_id))) return res.status(404).json({ success: false, message: 'Grupo AP no encontrado' });
        const apGroupId = await getApGroupIntId(nodo_id);
        if (!apGroupId) return res.status(404).json({ success: false, message: 'Grupo AP no encontrado' });

        let hostname = '', modelo = '', firmware = '', mac_lan = '', mac_wlan = '',
            frecuencia_mhz = null, ssid = '', canal_mhz = null, tx_power = null, modo_red = '';

        if (usuario_ssh && clave_ssh_plain) {
            try {
                const s = await getDetail(ip, port, usuario_ssh, clave_ssh_plain);
                hostname       = s.deviceName      || '';
                modelo         = s.deviceModel     || '';
                firmware       = s.firmwareVersion || '';
                mac_lan        = s.lanMac          || '';
                mac_wlan       = s.wlanMac         || '';
                frecuencia_mhz = s.frequency ? parseInt(s.frequency) : null;
                ssid           = s.essid           || '';
                canal_mhz      = s.channelWidth    || null;
                tx_power       = s.txPower         || null;
                modo_red       = s.networkMode     || '';
            } catch (sshErr) {
                log.warn({ err: sshErr.message }, 'SSH on register falló');
            }
        }

        // B: persistir el nodo dueño (por subred; nombre_nodo no se conoce al registrar).
        const nodeId = await resolveOwnerNodeId(db, { ip });

        await db.run(
            `INSERT INTO aps (uuid,ap_group_id,hostname,modelo,firmware,mac_lan,mac_wlan,ip,
             frecuencia_mhz,ssid,canal_mhz,tx_power,modo_red,usuario_ssh,clave_ssh_enc,puerto_ssh,node_id,is_active,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
            [uuid, apGroupId, hostname, modelo, firmware, mac_lan, mac_wlan, ip,
             frecuencia_mhz, ssid, canal_mhz, tx_power, modo_red,
             usuario_ssh || '', enc, port, nodeId, Date.now()]
        );
        res.json({ success: true, id: uuid, hostname, modelo, firmware, ssid, mac_wlan, frecuencia_mhz });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/aps/:id', async (req, res) => {
    try {
        const { ip, usuario_ssh, clave_ssh_plain, puerto_ssh, activo } = req.body;
        const db = await getDb();
        if (!(await ownsApUuid(db, req, req.params.id))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const ap = await db.get('SELECT * FROM aps WHERE uuid=?', req.params.id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const enc = clave_ssh_plain ? encryptPass(clave_ssh_plain) : ap.clave_ssh_enc;
        await db.run('UPDATE aps SET ip=?,usuario_ssh=?,clave_ssh_enc=?,puerto_ssh=?,is_active=?,updated_at=? WHERE uuid=?',
            [ip || ap.ip, usuario_ssh || ap.usuario_ssh, enc,
             parseInt(puerto_ssh) || ap.puerto_ssh, activo != null ? activo : ap.is_active, Date.now(), req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/aps/:id', async (req, res) => {
    try {
        const db = await getDb();
        if (!(await ownsApUuid(db, req, req.params.id))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        clearApCache(req.params.id);
        const apIntId = await getApIntId(req.params.id);
        if (!apIntId) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        // B10: Cascade delete — limpiar historial y nullear ap_id de CPEs
        await db.run('DELETE FROM signal_history WHERE ap_id=?', apIntId);
        await db.run('UPDATE cpes SET ap_id=NULL WHERE ap_id=?', apIntId);
        await db.run('DELETE FROM aps WHERE id=?', apIntId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Refresh AP static data (re-SSH) ──────────────────────────────────────
router.post('/aps/:id/refresh', async (req, res) => {
    try {
        const db = await getDb();
        if (!(await ownsApUuid(db, req, req.params.id))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const ap = await db.get('SELECT * FROM aps WHERE uuid=?', req.params.id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const pass = decryptPass(ap.clave_ssh_enc);
        const s = await getDetail(ap.ip, ap.puerto_ssh, ap.usuario_ssh, pass);
        await db.run(
            `UPDATE aps SET hostname=?,modelo=?,firmware=?,mac_lan=?,mac_wlan=?,
             frecuencia_mhz=?,ssid=?,canal_mhz=?,tx_power=?,modo_red=?,updated_at=? WHERE uuid=?`,
            [s.deviceName || ap.hostname, s.deviceModel || ap.modelo,
             s.firmwareVersion || ap.firmware, s.lanMac || ap.mac_lan, s.wlanMac || ap.mac_wlan,
             s.frequency ? parseInt(s.frequency) : ap.frecuencia_mhz,
             s.essid || ap.ssid, s.channelWidth || ap.canal_mhz,
             s.txPower || ap.tx_power, s.networkMode || ap.modo_red, Date.now(), req.params.id]
        );
        res.json({ success: true, stats: s });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Poll AP → wstalist (real-time) ────────────────────────────────────────
router.post('/aps/:id/poll', async (req, res) => {
    try {
        const db = await getDb();
        if (!(await ownsApUuid(db, req, req.params.id))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const ap = await db.get('SELECT * FROM aps WHERE uuid=?', req.params.id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const pass = decryptPass(ap.clave_ssh_enc);

        const stations = await pollAp(ap.uuid, ap.ip, ap.puerto_ssh, ap.usuario_ssh, pass, ap.firmware || '');

        // B8+B20: UPSERT atomico en transaccion — evita race condition y N+1
        await db.run('BEGIN');
        try {
            for (const sta of stations) {
                if (!sta.mac || !isValidMac(sta.mac)) continue;
                const statsJson = JSON.stringify(sta);
                await db.run(
                    `INSERT INTO cpes
                     (mac,ap_id,ip_lan,last_seen,last_stats,remote_hostname,remote_platform)
                     VALUES (?,?,?,?,?,?,?)
                     ON CONFLICT(mac) DO UPDATE SET
                       last_seen=excluded.last_seen,
                       ap_id=excluded.ap_id,
                       ip_lan=COALESCE(excluded.ip_lan, ip_lan),
                       last_stats=excluded.last_stats,
                       remote_hostname=COALESCE(excluded.remote_hostname, remote_hostname),
                       remote_platform=COALESCE(excluded.remote_platform, remote_platform)`,
                    [sta.mac, ap.id, sta.lastip || null, Date.now(), statsJson,
                     sta.remote_hostname || null, sta.remote_platform || null]
                );
                if (req.body?.saveHistory) {
                    // Need cpe integer id for signal_history FK
                    const cpeIntId = await getCpeIntId(sta.mac);
                    if (cpeIntId) {
                        // B6: sta.distance viene en metros, columna es distancia_km → convertir
                        await db.run(
                            `INSERT INTO signal_history
                             (cpe_id,ap_id,timestamp,signal_dbm,remote_signal_dbm,noisefloor_dbm,
                              cinr_db,ccq_pct,distancia_km,downlink_mbps,uplink_mbps,airtime_tx,airtime_rx)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                            [cpeIntId, ap.id, Date.now(), sta.signal, sta.remote_signal, sta.noisefloor,
                             sta.airmax_cinr_rx, sta.ccq,
                             sta.distance != null ? Math.round(sta.distance / 1000 * 100) / 100 : null,
                             sta.tx_rate ?? null, sta.rx_rate ?? null,
                             sta.airmax_tx_usage, sta.airmax_rx_usage]
                        );
                    }
                }
            }
            await db.run('COMMIT');
        } catch (e) { await db.run('ROLLBACK'); throw e; }

        // Enrich with known CPE names
        const macs = stations.map(s => s.mac).filter(Boolean);
        const known = macs.length > 0
            ? await db.all(`SELECT * FROM cpes WHERE mac IN (${macs.map(() => '?').join(',')})`, macs)
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
                                `INSERT INTO cpes (mac,ap_id,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,last_seen)
                                 VALUES (?,?,?,?,?,?,?,?,?)
                                 ON CONFLICT(mac) DO UPDATE SET
                                   hostname=COALESCE(excluded.hostname, hostname),
                                   modelo=COALESCE(excluded.modelo, modelo),
                                   firmware=COALESCE(excluded.firmware, firmware),
                                   ip_lan=excluded.ip_lan,
                                   mac_lan=COALESCE(excluded.mac_lan, mac_lan),
                                   mac_wlan=COALESCE(excluded.mac_wlan, mac_wlan),
                                   last_seen=excluded.last_seen`,
                                [sta.mac, ap.id || null, s.deviceName || '', s.deviceModel || '', s.firmwareVersion || '',
                                 sta.lastip, s.lanMac || '', s.wlanMac || '', Date.now()]
                            );
                        }
                    } catch { /* ignore individual failures */ }
                }
            })().catch(err => log.warn({ err: err.message }, 'Auto-enrich error'));
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
        // ap_id from frontend is a uuid
        if (!(await ownsApUuid(db, req, ap_id))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const ap = await db.get('SELECT * FROM aps WHERE uuid=?', ap_id);
        if (!ap) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const pass = decryptPass(ap.clave_ssh_enc);

        const s = await getDetail(cpe_ip, ap.puerto_ssh, ap.usuario_ssh, pass);
        const mac = req.params.mac.toUpperCase();

        // Save/update cpes
        await db.run(
            `INSERT INTO cpes
             (mac,ap_id,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,mac_ap,
              modo_red,frecuencia_mhz,canal_mhz,tx_power,ssid_ap,last_seen)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(mac) DO UPDATE SET
               hostname=excluded.hostname, modelo=excluded.modelo, firmware=excluded.firmware,
               ip_lan=excluded.ip_lan, mac_lan=excluded.mac_lan, mac_wlan=excluded.mac_wlan,
               mac_ap=excluded.mac_ap, modo_red=excluded.modo_red,
               frecuencia_mhz=excluded.frecuencia_mhz, canal_mhz=excluded.canal_mhz,
               tx_power=excluded.tx_power, ssid_ap=excluded.ssid_ap,
               last_seen=excluded.last_seen`,
            [mac, ap.id,
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
        const apIds = await ownedApIntIds(db, req);     // null = admin (todos)
        let cpes;
        if (apIds === null) {
            cpes = await db.all('SELECT * FROM cpes ORDER BY last_seen DESC');
        } else if (apIds.length === 0) {
            cpes = [];
        } else {
            const ph = apIds.map(() => '?').join(',');
            cpes = await db.all(`SELECT * FROM cpes WHERE ap_id IN (${ph}) ORDER BY last_seen DESC`, apIds);
        }
        res.json({ success: true, cpes });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Signal history ────────────────────────────────────────────────────────
router.get('/historial/:mac', async (req, res) => {
    try {
        const db    = await getDb();
        const limit = parseInt(req.query.limit) || 100;
        if (await cpeForeign(db, req, req.params.mac.toUpperCase())) return res.json({ success: true, historial: [] });
        const cpeIntId = await getCpeIntId(req.params.mac.toUpperCase());
        if (!cpeIntId) return res.json({ success: true, historial: [] });
        const rows  = await db.all(
            'SELECT * FROM signal_history WHERE cpe_id=? ORDER BY timestamp DESC LIMIT ?',
            [cpeIntId, limit]
        );
        res.json({ success: true, historial: rows.reverse() });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Poll AP directly — usa credenciales del nodo (node_ssh_creds) ────────
router.post('/poll-direct', async (req, res) => {
    let release = null; // lock de la scan-IP (Opción C), liberado en finally
    try {
        const { apId, saveHistory } = req.body;
        if (!apId) return res.status(400).json({ success: false, message: 'apId requerido' });

        const db = await getDb();
        // Aislamiento: el AP debe pertenecer al workspace del solicitante
        if (!(await ownsApUuid(db, req, apId))) return res.status(404).json({ success: false, message: 'AP no encontrado' });

        // C2: IP, puerto y firmware se leen SIEMPRE de la DB — nunca del body.
        // Evita forzar una conexión SSH (con las credenciales del AP) a un host arbitrario.
        // Se une `nodes` para el VRF del AP (necesario para la mangle de escaneo).
        const apRow = await db.get(
            `SELECT a.ip, a.usuario_ssh, a.clave_ssh_enc, a.puerto_ssh, a.nombre_nodo, a.node_id, a.firmware,
                    n.nombre_vrf AS nombre_vrf
               FROM aps a LEFT JOIN nodes n ON n.id = a.node_id
              WHERE a.uuid = ?`, [apId]
        );
        if (!apRow || !apRow.ip) return res.status(404).json({ success: false, message: 'AP no encontrado' });

        // Resolve AP integer id from uuid
        const apIntId = await getApIntId(apId);

        // C4: credenciales SSH resueltas server-side desde tabla aps (cifradas) o node_ssh_creds.
        let sshUser = apRow.usuario_ssh || '';
        let sshPass = apRow.clave_ssh_enc ? decryptPass(apRow.clave_ssh_enc) : '';
        // C3: si el AP no tiene credenciales propias, resolver las del nodo que lo POSEE
        // (por nombre_nodo / subred), no "el primer nodo que aparezca".
        if (!sshUser) {
            try {
                const c = await resolveNodeCreds(db, apRow);
                if (c) { sshUser = c.user; sshPass = c.pass; }
            } catch (e) {
                log.warn({ err: e.message }, 'poll-direct: error resolviendo credenciales del nodo');
            }
        }

        // Sin credenciales SSH resueltas → error CLARO (no forzar pollAp con user
        // vacío, que lanza y devuelve un 500 opaco). El AP necesita su clave
        // guardada (se persiste al guardarlo desde Escanear con la clave que
        // autenticó) o las del nodo dueño. Espejo de la guarda de ap-detail-direct.
        if (!sshUser) {
            return res.status(400).json({
                success: false,
                code: 'AP_NO_SSH',
                message: 'Este AP no tiene credenciales SSH guardadas. Guárdalo desde Escanear (con la clave que autenticó) o configúralas en el nodo dueño.',
            });
        }

        // ── Opción C (routing): atar el SSH a la scan-IP del workspace y asegurar
        // la mangle de escaneo (src=scan-IP → VRF del AP). SIN esto, el SSH desde
        // el VPS sale por la ruta por defecto y NO entra al túnel → "handshake
        // timeout" → 500. Mismo patrón que /device/antenna y apPollJob. En local
        // (sin scan-IP) localAddress queda null y el SSH sale directo.
        let localAddress = null;
        const ws = reqWorkspace(req);
        if (ws !== null && apRow.nombre_vrf) {
            const scanIp = await scanIpRepo.resolveForWorkspace(ws).catch(() => null);
            const mikrotik = scanIp ? await loadMikrotik() : null;
            if (scanIp && mikrotik) {
                // Espera acotada por el lock; si lo toma, (re)apunta la mangle al VRF
                // del AP. Si NO lo toma (un escaneo lo retiene con su mangle viva
                // hacia el mismo VRF), igual atamos a la scan-IP: la ruta ya existe.
                release = await scanLock.acquireOrNull(ws, 8000);
                if (release) {
                    try {
                        await scanMangle.setup({ workspaceId: ws, scanIp, vrfName: apRow.nombre_vrf, mikrotik });
                    } catch (e) {
                        log.warn({ ws, vrf: apRow.nombre_vrf, err: e.message }, 'poll-direct: no se pudo montar la scan mangle');
                    }
                }
                localAddress = scanIp;
            }
        }

        const stations = await pollAp(apId, apRow.ip, apRow.puerto_ssh || 22, sshUser, sshPass, apRow.firmware || '', localAddress);

        // B8+B17+B20: UPSERT atomico + validacion MAC + transaccion batch
        await db.run('BEGIN');
        try {
            for (const sta of stations) {
                if (!sta.mac || !isValidMac(sta.mac)) continue;
                const statsJson = JSON.stringify(sta);
                await db.run(
                    `INSERT INTO cpes
                     (mac,ap_id,ip_lan,last_seen,last_stats,remote_hostname,remote_platform)
                     VALUES (?,?,?,?,?,?,?)
                     ON CONFLICT(mac) DO UPDATE SET
                       last_seen=excluded.last_seen,
                       ap_id=excluded.ap_id,
                       ip_lan=COALESCE(excluded.ip_lan, ip_lan),
                       last_stats=excluded.last_stats,
                       remote_hostname=COALESCE(excluded.remote_hostname, remote_hostname),
                       remote_platform=COALESCE(excluded.remote_platform, remote_platform)`,
                    [sta.mac, apIntId, sta.lastip || null, Date.now(), statsJson,
                     sta.remote_hostname || null, sta.remote_platform || null]
                );
                if (saveHistory) {
                    const cpeIntId = await getCpeIntId(sta.mac);
                    if (cpeIntId && apIntId) {
                        // B6: sta.distance viene en metros, columna es distancia_km → convertir
                        await db.run(
                            `INSERT INTO signal_history
                             (cpe_id,ap_id,timestamp,signal_dbm,remote_signal_dbm,noisefloor_dbm,
                              cinr_db,ccq_pct,distancia_km,downlink_mbps,uplink_mbps,airtime_tx,airtime_rx)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                            [cpeIntId, apIntId, Date.now(), sta.signal, sta.remote_signal, sta.noisefloor,
                             sta.airmax_cinr_rx, sta.ccq,
                             sta.distance != null ? Math.round(sta.distance / 1000 * 100) / 100 : null,
                             sta.tx_rate ?? null, sta.rx_rate ?? null,
                             sta.airmax_tx_usage, sta.airmax_rx_usage]
                        );
                    }
                }
            }
            await db.run('COMMIT');
        } catch (e) { await db.run('ROLLBACK'); throw e; }

        const macs = stations.map(s => s.mac).filter(Boolean);
        const known = macs.length > 0
            ? await db.all(`SELECT * FROM cpes WHERE mac IN (${macs.map(() => '?').join(',')})`, macs)
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
    finally { if (release) release(); }
});

// ── Revelar la credencial SSH guardada del AP (solo el workspace dueño) ──
// Monitor AP: ver la clave con la que se accedió a la antena. Vive cifrada
// (AES-GCM) en aps.clave_ssh_enc; se descifra SERVER-SIDE y se devuelve SOLO
// bajo la sesión autenticada del dueño (ownsApUuid). No se expone en listados:
// solo bajo clic explícito de "revelar".
router.post('/reveal-ssh', async (req, res) => {
    try {
        const { apId } = req.body;
        if (!apId) return res.status(400).json({ success: false, message: 'apId requerido' });
        const db = await getDb();
        if (!(await ownsApUuid(db, req, apId))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const row = await db.get('SELECT usuario_ssh, clave_ssh_enc, puerto_ssh FROM aps WHERE uuid = ?', [apId]);
        if (!row || !row.usuario_ssh) {
            return res.status(404).json({ success: false, code: 'AP_NO_SSH', message: 'Este AP no tiene credenciales SSH guardadas' });
        }
        const pass = row.clave_ssh_enc ? decryptPass(row.clave_ssh_enc) : '';
        return res.json({ success: true, user: row.usuario_ssh, pass, port: row.puerto_ssh || 22 });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

// ── Full AP detail direct — all 12 SSH sections (ANTENNA_CMD) ────────────
router.post('/ap-detail-direct', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ success: false, message: 'id requerido' });

        const db = await getDb();
        // C4: aislamiento + credenciales/IP resueltas server-side desde la DB (nunca del body).
        if (!(await ownsApUuid(db, req, id))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        const row = await db.get('SELECT ip, usuario_ssh, clave_ssh_enc, puerto_ssh FROM aps WHERE uuid = ?', [id]);
        if (!row || !row.ip || !row.usuario_ssh) return res.status(404).json({ success: false, message: 'AP sin datos o sin credenciales SSH' });

        const actualPass = row.clave_ssh_enc ? decryptPass(row.clave_ssh_enc) : '';
        const s = await getFullDetail(row.ip, row.puerto_ssh || 22, row.usuario_ssh, actualPass);
        res.json({ success: true, stats: s });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Batch CPE enrich — SSH to multiple CPEs to get hostname/model ─────────
router.post('/cpes/enrich-batch', async (req, res) => {
    try {
        const { cpes, apId, port } = req.body;
        // cpes: [{ mac, ip }]
        if (!Array.isArray(cpes)) return res.status(400).json({ success: false, message: 'cpes[] requerido' });
        if (!apId) return res.status(400).json({ success: false, message: 'apId requerido' });
        const db = await getDb();

        // C1: aislamiento — el AP debe pertenecer al workspace del solicitante.
        if (!(await ownsApUuid(db, req, apId))) return res.status(404).json({ success: false, message: 'AP no encontrado' });

        // C4: credenciales SSH resueltas SIEMPRE server-side desde tabla aps (cifradas), nunca del body.
        const apRow = await db.get('SELECT usuario_ssh, clave_ssh_enc, puerto_ssh FROM aps WHERE uuid = ?', [apId]);
        if (!apRow || !apRow.usuario_ssh) return res.status(400).json({ success: false, message: 'AP sin credenciales SSH' });
        const user = apRow.usuario_ssh;
        const pass = apRow.clave_ssh_enc ? decryptPass(apRow.clave_ssh_enc) : '';
        const sshPort = parseInt(port) || apRow.puerto_ssh || 22;

        const results = [];
        for (const { mac, ip } of cpes) {
            if (!mac || !ip) continue;
            try {
                const s = await getDetail(ip, sshPort, user, pass);
                const MAC = mac.toUpperCase();
                await db.run(
                    `INSERT INTO cpes (mac,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,last_seen)
                     VALUES (?,?,?,?,?,?,?,?)
                     ON CONFLICT(mac) DO UPDATE SET
                       hostname=COALESCE(excluded.hostname, hostname),
                       modelo=COALESCE(excluded.modelo, modelo),
                       firmware=COALESCE(excluded.firmware, firmware),
                       ip_lan=excluded.ip_lan,
                       mac_lan=COALESCE(excluded.mac_lan, mac_lan),
                       mac_wlan=COALESCE(excluded.mac_wlan, mac_wlan),
                       last_seen=excluded.last_seen`,
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

// ── CPE detail direct — resuelve credenciales en orden: CPE propio > AP > nodo > ubnt default ──
router.post('/cpes/:mac/detail-direct', async (req, res) => {
    try {
        const { cpe_ip, port, user, pass, apId } = req.body;
        if (!cpe_ip) return res.status(400).json({ success: false, message: 'cpe_ip requerido' });

        const db = await getDb();
        const mac = req.params.mac.toUpperCase();
        // Aislamiento: no permitir leer un CPE que pertenece a otro workspace,
        // ni usar como fallback un AP ajeno.
        if (await cpeForeign(db, req, mac)) return res.status(404).json({ success: false, message: 'CPE no encontrado' });
        if (apId && !(await ownsApUuid(db, req, apId))) return res.status(404).json({ success: false, message: 'AP no encontrado' });
        let credList = [];

        // 1. Credenciales propias del CPE (almacenadas en cpes)
        try {
            const cpeRow = await db.get(
                'SELECT usuario_ssh, clave_ssh_enc, puerto_ssh FROM cpes WHERE mac = ?', [mac]
            );
            if (cpeRow && cpeRow.usuario_ssh) {
                credList.push({ user: cpeRow.usuario_ssh, pass: cpeRow.clave_ssh_enc ? decryptPass(cpeRow.clave_ssh_enc) : '', port: cpeRow.puerto_ssh || 22 });
            }
        } catch (e) {
            log.warn({ err: e.message }, 'detail-direct: error leyendo credenciales propias del CPE');
        }

        // 2. Credenciales del AP padre y su nodo (como fallback)
        if (apId) {
            try {
                const apRow = await db.get('SELECT id, usuario_ssh, clave_ssh_enc, nombre_nodo, node_id, ip, puerto_ssh FROM aps WHERE uuid = ?', [apId]);
                if (apRow) {
                    if (apRow.usuario_ssh) {
                        credList.push({ user: apRow.usuario_ssh, pass: apRow.clave_ssh_enc ? decryptPass(apRow.clave_ssh_enc) : '', port: apRow.puerto_ssh || 22 });
                    }
                    // C3: priorizar las credenciales del nodo que POSEE este AP (por
                    // nombre_nodo / subred) antes que la lista genérica de todos los nodos.
                    const owner = await resolveNodeCreds(db, apRow);
                    if (owner && owner.user) credList.push(owner);
                    // Resto de node_ssh_creds como último recurso (puede que el CPE
                    // use credenciales de otro nodo en topologías mixtas).
                    const nodeCredRows = await db.all(
                        'SELECT ssh_user, ssh_pass_enc, ssh_port FROM node_ssh_creds ORDER BY priority'
                    );
                    for (const c of nodeCredRows) {
                        credList.push({ user: c.ssh_user || '', pass: c.ssh_pass_enc ? decryptPass(c.ssh_pass_enc) : '', port: c.ssh_port || 22 });
                    }
                }
            } catch (e) {
                log.warn({ err: e.message }, 'detail-direct: error buscando credenciales del AP/nodo');
            }
        }

        // 3. Credenciales enviadas explicitamente por el frontend (si son distintas de las ya acumuladas)
        if (user && !credList.some(c => c.user === user)) {
            credList.push({ user, pass: pass || '', port: parseInt(port) || 22 });
        }

        // 4. Default Ubiquiti airOS (ubnt/ubnt)
        if (!credList.some(c => c.user === 'ubnt')) {
            credList.push({ user: 'ubnt', pass: 'ubnt', port: parseInt(port) || 22 });
        }

        const sshPort = parseInt(port) || 22;
        let s = null, lastError = null, usedCred = null;
        for (const cred of credList) {
            try {
                s = await getDetail(cpe_ip, cred.port || sshPort, cred.user, cred.pass);
                usedCred = cred;
                break;
            } catch (e) {
                lastError = e;
                log.warn({ user: cred.user, ip: cpe_ip, err: e.message }, 'detail-direct: credencial fallida en CPE');
            }
        }
        if (!s) throw lastError || new Error('Sin credenciales validas');

        // Persistir credenciales que funcionaron en cpes
        if (usedCred) {
            const existingCpe = await db.get('SELECT usuario_ssh FROM cpes WHERE mac = ?', [mac]);
            if (!existingCpe || !existingCpe.usuario_ssh) {
                const encPass = usedCred.pass ? encryptPass(usedCred.pass) : null;
                await db.run(
                    `INSERT INTO cpes (mac, usuario_ssh, clave_ssh_enc, puerto_ssh, last_seen)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(mac) DO UPDATE SET
                       usuario_ssh = excluded.usuario_ssh,
                       clave_ssh_enc = excluded.clave_ssh_enc,
                       puerto_ssh  = excluded.puerto_ssh`,
                    [mac, usedCred.user, encPass, usedCred.port || 22, Date.now()]
                );
            }
        }

        // Resolve ap integer id for the FK
        const apIntId = apId ? await getApIntId(apId) : null;

        await db.run(
            `INSERT INTO cpes
             (mac,ap_id,hostname,modelo,firmware,ip_lan,mac_lan,mac_wlan,mac_ap,
              modo_red,frecuencia_mhz,canal_mhz,tx_power,ssid_ap,last_seen)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(mac) DO UPDATE SET
               hostname=excluded.hostname, modelo=excluded.modelo, firmware=excluded.firmware,
               ip_lan=excluded.ip_lan, mac_lan=excluded.mac_lan, mac_wlan=excluded.mac_wlan,
               mac_ap=excluded.mac_ap, modo_red=excluded.modo_red,
               frecuencia_mhz=excluded.frecuencia_mhz, canal_mhz=excluded.canal_mhz,
               tx_power=excluded.tx_power, ssid_ap=excluded.ssid_ap,
               last_seen=excluded.last_seen`,
            [mac, apIntId || null,
             s.deviceName || '', s.deviceModel || '', s.firmwareVersion || '',
             cpe_ip, s.lanMac || '', s.wlanMac || '', s.apMac || '',
             s.networkMode || '', s.frequency || null, s.channelWidth || null,
             s.txPower || null, s.essid || '', Date.now()]
        );

        res.json({ success: true, stats: { ...s, ip: cpe_ip } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Guardar/actualizar credenciales SSH de un CPE especifico ─────────────
router.put('/cpes/:mac/credentials', async (req, res) => {
    try {
        const mac = req.params.mac.toUpperCase();
        const { user, pass, port } = req.body;
        if (!user) return res.status(400).json({ success: false, message: 'user requerido' });
        const db = await getDb();
        if (await cpeForeign(db, req, mac)) return res.status(404).json({ success: false, message: 'CPE no encontrado' });
        const encPass = pass ? encryptPass(pass) : null;
        await db.run(
            `INSERT INTO cpes (mac, usuario_ssh, clave_ssh_enc, puerto_ssh, last_seen)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(mac) DO UPDATE SET
               usuario_ssh   = excluded.usuario_ssh,
               clave_ssh_enc = excluded.clave_ssh_enc,
               puerto_ssh    = excluded.puerto_ssh`,
            [mac, user, encPass, parseInt(port) || 22, Date.now()]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Poll masivo — pollea todos los APs activos del AP Monitor ────────────
// Actualiza last_stats en cpes para cada CPE visible.
// Usado por el boton "Actualizar" de la topologia.
router.post('/poll-all-monitor', async (req, res) => {
    try {
        const db  = await getDb();
        const apIds = await ownedApIntIds(db, req);     // null = admin (todos)
        let aps;
        if (apIds === null) {
            aps = await db.all('SELECT * FROM aps WHERE is_active = 1');
        } else if (apIds.length === 0) {
            aps = [];
        } else {
            const ph = apIds.map(() => '?').join(',');
            aps = await db.all(`SELECT * FROM aps WHERE is_active = 1 AND id IN (${ph})`, apIds);
        }
        let ok = 0, fail = 0;

        // B3: Limitar concurrencia a 3 APs simultaneos para no saturar el pool MySQL ni los APs
        const BATCH_SIZE = 3;
        for (let i = 0; i < aps.length; i += BATCH_SIZE) {
            await Promise.allSettled(aps.slice(i, i + BATCH_SIZE).map(async (ap) => {
                try {
                    const pass     = decryptPass(ap.clave_ssh_enc);
                    const stations = await pollAp(ap.uuid, ap.ip, ap.puerto_ssh, ap.usuario_ssh, pass, ap.firmware || '');

                    await db.run('BEGIN');
                    try {
                        for (const sta of stations) {
                            if (!sta.mac || !isValidMac(sta.mac)) continue;
                            const statsJson = JSON.stringify(sta);
                            // B8: UPSERT atomico — evita race condition SELECT-then-INSERT
                            await db.run(
                                `INSERT INTO cpes
                                 (mac,ap_id,ip_lan,last_seen,last_stats,remote_hostname,remote_platform)
                                 VALUES (?,?,?,?,?,?,?)
                                 ON CONFLICT(mac) DO UPDATE SET
                                   last_seen=excluded.last_seen,
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

// ── CPEs para Topologia — CPEs conocidos con AP info y ultimo senal ───────
// ap_id in cpes is now an INTEGER FK to aps.id
router.get('/topology-cpes', async (req, res) => {
    try {
        const db = await getDb();

        // 1. Todos los CPEs con ap_id asignado (limitado al workspace)
        const apIds = await ownedApIntIds(db, req);     // null = admin (todos)
        let cpes;
        if (apIds === null) {
            cpes = await db.all(`
                SELECT c.id, c.mac, c.hostname, c.modelo, c.firmware,
                       c.ip_lan, c.mac_wlan, c.mac_ap, c.ssid_ap,
                       c.frecuencia_mhz, c.last_seen, c.ap_id,
                       c.last_stats, c.remote_hostname, c.remote_platform
                FROM cpes c WHERE c.ap_id IS NOT NULL ORDER BY c.last_seen DESC`);
        } else if (apIds.length === 0) {
            cpes = [];
        } else {
            const ph = apIds.map(() => '?').join(',');
            cpes = await db.all(`
                SELECT c.id, c.mac, c.hostname, c.modelo, c.firmware,
                       c.ip_lan, c.mac_wlan, c.mac_ap, c.ssid_ap,
                       c.frecuencia_mhz, c.last_seen, c.ap_id,
                       c.last_stats, c.remote_hostname, c.remote_platform
                FROM cpes c WHERE c.ap_id IN (${ph}) ORDER BY c.last_seen DESC`, apIds);
        }

        if (cpes.length === 0) { return res.json({ success: true, cpes: [] }); }

        // 2. Resolver AP info para cada ap_id unico (INTEGER)
        const apIntIds = [...new Set(cpes.map(c => c.ap_id))];

        const apsPh   = apIntIds.map(() => '?').join(',');
        const apsRows = await db.all(
            `SELECT id, uuid, ip, hostname, ssid, ap_group_id FROM aps WHERE id IN (${apsPh})`,
            apIntIds
        );

        // Cargar nodos VPN para resolver nodeId por subred (segmento_lan)
        const vpnNodeRows = await db.all('SELECT * FROM nodes');
        const vpnNodes = vpnNodeRows || [];

        // Helper: dada una IP, devuelve el ppp_user del nodo VPN cuya subred la contiene
        const nodeIdByIp = (ip) => {
            if (!ip) return null;
            for (const n of vpnNodes) {
                if (n.segmento_lan && ipInCidr(ip, n.segmento_lan)) return n.ppp_user || null;
            }
            return null;
        };

        // Mapa ap integer id → { ip, hostname, nodeId, uuid }
        const apMap = {};
        apsRows.forEach(a => {
            const nodeId = nodeIdByIp(a.ip);
            apMap[a.id] = { ip: a.ip, hostname: a.hostname || a.ssid || '', nodeId, uuid: a.uuid };
        });

        // 3. Ultima senal por CPE — use cpe integer id
        const cpeIntIds = cpes.map(c => c.id).filter(Boolean);
        const sigMap = {};
        if (cpeIntIds.length > 0) {
            const ph  = cpeIntIds.map(() => '?').join(',');
            const rows = await db.all(`
                SELECT h.cpe_id, h.signal_dbm, h.noisefloor_dbm, h.ccq_pct,
                       h.downlink_mbps, h.uplink_mbps, h.distancia_km, h.timestamp
                FROM signal_history h
                INNER JOIN (
                    SELECT cpe_id, MAX(timestamp) AS ts
                    FROM signal_history WHERE cpe_id IN (${ph})
                    GROUP BY cpe_id
                ) lts ON h.cpe_id = lts.cpe_id AND h.timestamp = lts.ts
            `, cpeIntIds);
            rows.forEach(r => { sigMap[r.cpe_id] = r; });
        }

        const result = cpes.map(c => {
            const apInfo = apMap[c.ap_id] || {};
            // Si el AP no resolvio nodeId, intentar por IP del CPE directamente
            const nodeId = apInfo.nodeId || nodeIdByIp(c.ip_lan) || null;
            return {
                ...c,
                ap_ip:       apInfo.ip       || null,
                ap_hostname: apInfo.hostname || null,
                ap_nodeId:   nodeId,
                ap_uuid:     apInfo.uuid     || null,
                lastSignal:  sigMap[c.id]    || null,
            };
        });

        res.json({ success: true, cpes: result });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── E1: heartbeat "estoy mirando Monitor AP" ─────────────────────────────
// Mientras el frontend tenga la vista abierta manda este latido (~30s). El
// apPollJob solo pollea workspaces con latido reciente (§43: SSH solo si
// alguien está mirando).
router.post('/watch', (req, res) => {
    const ws = reqWorkspace(req);                    // null = platform_admin
    if (ws && ws !== '__none__') apWatch.touch(ws);
    res.json({ success: true, intervalMs: Number(process.env.AP_POLL_INTERVAL_MS || 60_000) });
});

// ── E1: estaciones actuales desde la BD (cpes.last_stats) ────────────────
// Seed inmediato del frontend al montar, sin esperar a un poll. Aislado por
// workspace vía ownedApIntIds.
router.get('/stations', async (req, res) => {
    try {
        const db = await getDb();
        const apIds = await ownedApIntIds(db, req);  // null = admin (todos)
        let cpes;
        if (apIds === null) {
            cpes = await db.all('SELECT ap_id, last_stats, last_seen FROM cpes WHERE ap_id IS NOT NULL');
        } else if (apIds.length === 0) {
            cpes = [];
        } else {
            const ph = apIds.map(() => '?').join(',');
            cpes = await db.all(`SELECT ap_id, last_stats, last_seen FROM cpes WHERE ap_id IN (${ph})`, apIds);
        }

        const apIntIds = [...new Set(cpes.map(c => c.ap_id))];
        const uuidById = {};
        if (apIntIds.length > 0) {
            const ph = apIntIds.map(() => '?').join(',');
            const aps = await db.all(`SELECT id, uuid FROM aps WHERE id IN (${ph})`, apIntIds);
            aps.forEach(a => { uuidById[a.id] = a.uuid; });
        }

        const byAp = {};
        for (const c of cpes) {
            const uuid = uuidById[c.ap_id];
            if (!uuid) continue;
            if (!byAp[uuid]) byAp[uuid] = { stations: [], polledAt: 0 };
            let sta = null;
            try { sta = c.last_stats ? JSON.parse(c.last_stats) : null; } catch { /* ignora JSON corrupto */ }
            if (sta) byAp[uuid].stations.push(sta);
            if (c.last_seen > byAp[uuid].polledAt) byAp[uuid].polledAt = c.last_seen;
        }
        res.json({ success: true, aps: byAp });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
