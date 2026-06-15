// ============================================================
//  device.routes.js — operaciones sobre APs Ubiquiti + RouterOS aux.
//  Fase F5.A: shape uniforme (sendOk/AppError) + asyncHandler.
// ============================================================
const express = require('express');
const router = express.Router();
const { connectToMikrotik, safeWrite, getErrorMessage } = require('../routeros.service');
const { sshExec, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptPass, decryptPass, getApGroupIntId } = require('../db.service');
const log = require('../lib/logger').child({ scope: 'device' });
const { reqWorkspace, ownedGroupIntIds, ownsApUuid, ownsGroupUuid, ipInOwnedSubnet } = require('../lib/tenantScope');
const { resolveOwnerNodeId } = require('../lib/apNode');
const { sendOk, AppError, asyncHandler } = require('../lib/apiResponse');

// /device/auto-login: 200 OK siempre — el flag `authenticated` señala el resultado.
router.post('/device/auto-login', asyncHandler(async (req, res) => {
  const { ip, sshCredentials } = req.body;
  // H14 — Anti-SSRF: solo se puede sondear SSH contra IPs de subredes propias.
  const db = await getDb();
  if (!(await ipInOwnedSubnet(db, req, ip))) {
    throw new AppError('La IP no pertenece a ninguna de tus subredes', 403, 'FORBIDDEN');
  }
  const credResult = await trySshCredentials(ip, sshCredentials);
  if (credResult) {
    return sendOk(res, {
      authenticated: true,
      user: credResult.user,
      pass: credResult.pass,
      port: credResult.port,
      stats: credResult.stats,
    });
  }
  return sendOk(res, { authenticated: false, message: 'Autenticación fallida' });
}));

// /device/antenna: errores de red/auth son ESPERADOS (200 OK con flag); solo
// errores inesperados del servidor caen al middleware central.
router.post('/device/antenna', asyncHandler(async (req, res) => {
  const { deviceIP, deviceUser, devicePass, devicePort, deviceId } = req.body;
  try {
    const db = await getDb();
    let targetIP = deviceIP;
    let targetUser = deviceUser;
    let targetPass = devicePass;
    let targetPort = parseInt(devicePort) || 22;

    if (deviceId) {
      // H14 — Device GUARDADO: resolver IP + credencial SERVER-SIDE del AP propio.
      // Anti-SSRF (ignora deviceIP del body) y deja de depender del caché cliente
      // en claro. Solo cae al pass del body si el AP no tiene credencial guardada.
      if (!(await ownsApUuid(db, req, deviceId))) throw new AppError('AP no encontrado', 404, 'NOT_FOUND');
      const row = await db.get('SELECT ip, usuario_ssh, clave_ssh_enc, puerto_ssh FROM aps WHERE uuid = ?', [deviceId]);
      if (!row) throw new AppError('AP no encontrado', 404, 'NOT_FOUND');
      targetIP = row.ip;
      targetUser = row.usuario_ssh || deviceUser;
      targetPass = row.clave_ssh_enc ? decryptPass(row.clave_ssh_enc) : (devicePass || '');
      targetPort = row.puerto_ssh || targetPort;
    } else {
      // H14 — Escaneo (device aún no guardado): la IP debe pertenecer a una de
      // TUS subredes (anti-SSRF a IPs arbitrarias). La credencial sí viene del
      // body porque el equipo todavía no existe en la BD.
      if (!(await ipInOwnedSubnet(db, req, deviceIP))) {
        throw new AppError('La IP no pertenece a ninguna de tus subredes', 403, 'FORBIDDEN');
      }
    }

    // Comando combinado: mca-status + system.cfg + hostname + version + ifconfig
    const output = await sshExec(targetIP, targetPort, targetUser, targetPass || '', ANTENNA_CMD, 20000, 8000);
    return sendOk(res, { stats: parseFullOutput(output) });
  } catch (error) {
    if (error instanceof AppError) throw error;   // 403/404 → middleware central
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
    log.debug({ deviceIP, friendly }, 'SSH');
    return res.json({ success: false, message: friendly });
  }
}));

router.post('/device/wifi/get', asyncHandler(async (req, res) => {
  const { routerIP, routerUser, routerPass } = req.body;
  let api;
  try {
    api = await connectToMikrotik(routerIP, routerUser, routerPass || '');
    // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
    const ifaces   = await safeWrite(api, ['/interface/wireless/print']).catch(() => []);
    const profiles = await safeWrite(api, ['/interface/wireless/security-profiles/print']).catch(() => []);
    await api.close();
    return sendOk(res, {
      interfaces: Array.isArray(ifaces) ? ifaces.map(i => ({ id: i['.id'], name: i.name, ssid: i.ssid, mode: i.mode, disabled: i.disabled === 'true' })) : [],
      profiles: Array.isArray(profiles) ? profiles.map(p => ({ id: p['.id'], name: p.name, wpa2Key: p['wpa2-pre-shared-key'] })) : [],
    });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(getErrorMessage(error, routerIP, routerUser), 500, 'MIKROTIK_ERROR');
  }
}));

// A partir de este punto: Endpoints Migrados 100% a la tabla de Auditoria SQL "aps" (schema v2)

router.get('/db/devices', asyncHandler(async (req, res) => {
    const db = await getDb();
    const gids = await ownedGroupIntIds(db, req);   // null = admin (todos)
    let rows;
        if (gids === null) {
            rows = await db.all(
                `SELECT a.*, ag.uuid AS ap_group_uuid
                 FROM aps a LEFT JOIN ap_groups ag ON ag.id = a.ap_group_id`);
        } else if (gids.length === 0) {
            rows = [];
        } else {
            const ph = gids.map(() => '?').join(',');
            rows = await db.all(
                `SELECT a.*, ag.uuid AS ap_group_uuid
                 FROM aps a JOIN ap_groups ag ON ag.id = a.ap_group_id
                 WHERE a.ap_group_id IN (${ph})`, gids);
        }
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
    return sendOk(res, { devices });
}));

router.post('/db/devices', asyncHandler(async (req, res) => {
    const db = await getDb();
    const d = req.body;
    const now = Date.now();

    // Aislamiento: no sobrescribir un AP existente de otro workspace
    if (d.id) {
        const existing = await db.get('SELECT id FROM aps WHERE uuid = ?', [d.id]);
        if (existing && !(await ownsApUuid(db, req, d.id))) {
            throw new AppError('AP no encontrado', 404, 'NOT_FOUND');
        }
    }

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
        const ws = reqWorkspace(req);
        let apGroupId = d.nodeId ? await getApGroupIntId(d.nodeId) : null;
        // Si el grupo resuelto no pertenece al workspace del solicitante, no permitir adjuntar
        if (apGroupId && d.nodeId && !(await ownsGroupUuid(db, req, d.nodeId))) {
            throw new AppError('Grupo AP no encontrado', 404, 'NOT_FOUND');
        }
        if (d.nodeId && !apGroupId) {
            // Fallback: buscar ap_group por nombre (nodeName) DENTRO del workspace
            if (d.nodeName) {
                const byName = ws === null
                    ? await db.get('SELECT id FROM ap_groups WHERE nombre = ?', [d.nodeName])
                    : await db.get('SELECT id FROM ap_groups WHERE nombre = ? AND workspace_id = ?', [d.nodeName, ws]);
                if (byName) {
                    apGroupId = byName.id;
                } else {
                    // Auto-crear grupo con el nombre del nodo, estampando el workspace
                    const crypto = require('crypto');
                    const newUuid = crypto.randomBytes(8).toString('hex');
                    const result = await db.run(
                        'INSERT INTO ap_groups (uuid, nombre, descripcion, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                        [newUuid, d.nodeName, 'Auto-creado', ws, Date.now(), Date.now()]
                    );
                    apGroupId = result.lastID;
                }
            }
            // Si aún no hay grupo, continuar con null (no bloquear el guardado)
        }

        // B: nodo VPN dueño del AP (por nombre_nodo / subred). Si no resuelve,
        // queda NULL y el resolver en caliente lo cubre en cada poll.
        const apNodeId = await resolveOwnerNodeId(db, { nombre_nodo: d.nodeName, ip: d.ip });

        // UPSERT en la tabla "aps" (schema v2: uuid UNIQUE, id INTEGER AUTO)
        await db.run(
            `INSERT INTO aps (
                uuid, ap_group_id, hostname, modelo, firmware, mac_lan, mac_wlan, ip, frecuencia_mhz,
                ssid, canal_mhz, modo_red, usuario_ssh, clave_ssh_enc, puerto_ssh, wifi_password_enc,
                cpes_conectados_count, last_saved, is_active, nombre_nodo, node_id, router_port, last_seen,
                created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                node_id = COALESCE(excluded.node_id, aps.node_id),
                router_port = excluded.router_port,
                last_seen = excluded.last_seen,
                updated_at = ${now}`,
            [
                d.id, apGroupId, d.name || d.deviceName || '', d.model || '', d.firmware || '',
                d.lanMac || '', d.wlanMac || '', d.ip || '', d.frequency || null, d.essid || '',
                d.channelWidth || null, d.role === 'sta' ? 'station' : 'ap',
                d.sshUser || '', sshEncrypted, d.sshPort || 22, wifiEncrypted,
                cpesCount, now, (d.is_active !== false && d.is_active !== 0) ? 1 : 0,
                d.nodeName || '', apNodeId, d.routerPort || 8075, d.lastSeen || 0,
                d.addedAt || now
            ]
        );
    return sendOk(res, { id: d.id });
}));

router.put('/db/devices/:id', asyncHandler(async (req, res) => {
    const db = await getDb();
    const uuid = req.params.id; // frontend sends UUID as :id
    if (!(await ownsApUuid(db, req, uuid))) throw new AppError('AP no encontrado', 404, 'NOT_FOUND');
    const exists = await db.get('SELECT id FROM aps WHERE uuid = ?', [uuid]);
    if (!exists) throw new AppError('AP no encontrado', 404, 'NOT_FOUND');

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
        // B: al mover, sincronizar nombre_nodo y recomputar el nodo VPN dueño.
        // Si no resuelve, node_id queda NULL → el resolver en caliente lo recalcula.
        if (d.nodeName !== undefined) { sets.push('nombre_nodo = ?'); params.push(d.nodeName || ''); }
        if (d.nodeName !== undefined || d.ip !== undefined) {
            const movedNodeId = await resolveOwnerNodeId(db, { nombre_nodo: d.nodeName, ip: d.ip });
            sets.push('node_id = ?'); params.push(movedNodeId);
        }
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
    return sendOk(res);
}));

router.delete('/db/devices/:id', asyncHandler(async (req, res) => {
    const db = await getDb();
    const uuid = req.params.id; // frontend sends UUID
    if (!(await ownsApUuid(db, req, uuid))) throw new AppError('AP no encontrado', 404, 'NOT_FOUND');
    await db.run('DELETE FROM aps WHERE uuid = ?', [uuid]);
    return sendOk(res);
}));

// Limpieza basada en la relación Nodos <-> APs (schema v2)
router.post('/db/cleanup-orphan-devices', asyncHandler(async (req, res) => {
    // Mantenimiento global: solo el Administrador de plataforma puede ejecutarlo.
    if (reqWorkspace(req) !== null) {
        return sendOk(res, { devicesDeleted: 0, cpesDeleted: 0, orphanIds: [], message: 'Operación reservada al administrador' });
    }
    const db = await getDb();

        // CPEs huérfanos: sin AP asociado (ap_id NULL) → no atribuibles a ningún
        // workspace. Se eliminan siempre para evitar incongruencias.
        const orphanCpes = await db.run('DELETE FROM cpes WHERE ap_id IS NULL');
        const orphanCpesDeleted = orphanCpes.changes || 0;

        // v2: nodes tiene columnas directas, no JSON data
    const validNodes = await db.all('SELECT id, ppp_user, nombre_nodo, nombre_vrf FROM nodes');
    if (validNodes.length === 0) {
        return sendOk(res, { devicesDeleted: 0, cpesDeleted: 0, orphanCpesDeleted, orphanIds: [], message: 'No hay nodos válidos — limpieza de APs abortada por seguridad' });
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
        return sendOk(res, { devicesDeleted: 0, cpesDeleted: 0, orphanCpesDeleted, orphanIds: [], message: `Sin APs huérfanos${orphanCpesDeleted ? ` · ${orphanCpesDeleted} CPE(s) huérfano(s) eliminado(s)` : ''}` });
    }

    const orphanIntIds = orphans.map(d => d.id);
    const orphanUuids = orphans.map(d => d.uuid);
    const placeholders = orphanIntIds.map(() => '?').join(',');

    // v2: cpes table with INTEGER ap_id FK
    const cpesResult = await db.run(`DELETE FROM cpes WHERE ap_id IN (${placeholders})`, orphanIntIds);
    const devResult = await db.run(`DELETE FROM aps WHERE id IN (${placeholders})`, orphanIntIds);

    return sendOk(res, {
        devicesDeleted: devResult.changes,
        cpesDeleted: cpesResult.changes,
        orphanCpesDeleted,
        orphanIds: orphanUuids,
    });
}));

module.exports = router;
