const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// ── Directorio de datos y cifrado ──────────────────────────────────────────
const DATA_DIR    = process.env.DATA_DIR || __dirname;
const SECRET_FILE = path.join(DATA_DIR, '.db_secret');
const DB_FILE     = path.join(DATA_DIR, 'database.sqlite');
const SCHEMA_FILE = path.join(__dirname, 'schema_v2.sql');
let ENCRYPTION_KEY;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (fs.existsSync(SECRET_FILE)) {
    ENCRYPTION_KEY = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8'), 'hex');
} else {
    ENCRYPTION_KEY = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE, ENCRYPTION_KEY.toString('hex'), { mode: 0o600 });
}

let db;

// ══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN — Schema v2.0 normalizado
// ══════════════════════════════════════════════════════════════════════════

async function initDb() {
    db = await open({ filename: DB_FILE, driver: sqlite3.Database });

    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA synchronous = NORMAL;');
    await db.exec('PRAGMA foreign_keys = ON;');

    // Detectar si estamos en schema v2 (tabla nodes con columna ppp_user)
    const colInfo = await db.all("PRAGMA table_info('nodes')").catch(() => []);
    const hasV2 = colInfo.some(c => c.name === 'ppp_user');

    if (hasV2) {
        console.log('[DB] Schema v2.0 detectado — tablas normalizadas.');
    } else {
        // Verificar si la migración fue ejecutada (tablas _old_ existen)
        const hasMigration = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='_migration_v2_done'");
        if (hasMigration) {
            console.log('[DB] Migración v2 completada previamente.');
        } else {
            console.error('[DB] ⚠ Schema v1 detectado. Ejecuta primero: node server/migrate_v2.js');
            // Crear tablas v2 vacías si no existen (fresh install)
            if (colInfo.length === 0) {
                console.log('[DB] Instalación nueva — creando schema v2.0...');
                if (fs.existsSync(SCHEMA_FILE)) {
                    const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
                    const stmts = sql.split(';').map(s => s.trim()).filter(s =>
                        s.length > 0 && !s.startsWith('PRAGMA') && !s.startsWith('--')
                    );
                    for (const stmt of stmts) {
                        try { await db.exec(stmt + ';'); } catch (e) {
                            if (!e.message.includes('already exists')) console.warn('[DB]', e.message.substring(0, 80));
                        }
                    }
                    console.log('[DB] Schema v2.0 creado correctamente.');
                }
            }
        }
    }

    // Migraciones de columnas (idempotentes — ignora si ya existe)
    const migrate = async (sql) => {
        try { await db.run(sql); } catch (e) {
            if (!e.message?.includes('duplicate column')) console.error('[DB]', e.message);
        }
    };
    await migrate("ALTER TABLE nodes ADD COLUMN lan_subnets TEXT DEFAULT '[]'");
    await migrate("ALTER TABLE nodes ADD COLUMN protocol TEXT DEFAULT 'sstp'");
    await migrate("ALTER TABLE nodes ADD COLUMN node_number INTEGER DEFAULT NULL");
    await migrate("ALTER TABLE app_settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");

    // Índices de rendimiento (idempotentes)
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_nodes_ppp_user ON nodes(ppp_user)',
        'CREATE INDEX IF NOT EXISTS idx_nodes_nombre_vrf ON nodes(nombre_vrf)',
        'CREATE INDEX IF NOT EXISTS idx_node_ssh_node ON node_ssh_creds(node_id)',
        'CREATE INDEX IF NOT EXISTS idx_node_hist_node ON node_history(node_id)',
        'CREATE INDEX IF NOT EXISTS idx_node_hist_ts ON node_history(timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_torres_node ON torres(node_id)',
        'CREATE INDEX IF NOT EXISTS idx_aps_group ON aps(ap_group_id)',
        'CREATE INDEX IF NOT EXISTS idx_aps_active ON aps(is_active)',
        'CREATE INDEX IF NOT EXISTS idx_aps_ip ON aps(ip)',
        'CREATE INDEX IF NOT EXISTS idx_cpes_ap ON cpes(ap_id)',
        'CREATE INDEX IF NOT EXISTS idx_cpes_mac ON cpes(mac)',
        'CREATE INDEX IF NOT EXISTS idx_sig_cpe_ts ON signal_history(cpe_id, timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_sig_ap_ts ON signal_history(ap_id, timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_vpn_users_username ON vpn_users(username)',
    ];
    for (const idx of indexes) {
        await db.run(idx).catch(() => {});
    }

    // Purgar historial > 30 días
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    await db.run('DELETE FROM signal_history WHERE timestamp < ?', [thirtyDaysAgo]).catch(() => {});

    console.log('[DB] Base de datos SQLite v2.0 conectada y validada.');
}

async function getDb() {
    if (!db) await initDb();
    return db;
}

// ══════════════════════════════════════════════════════════════════════════
// CIFRADO AES-256-GCM
// ══════════════════════════════════════════════════════════════════════════

function encryptPass(plaintext) {
    if (!plaintext) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let enc = cipher.update(plaintext, 'utf8', 'hex');
    enc += cipher.final('hex');
    return JSON.stringify({ iv: iv.toString('hex'), data: enc, tag: cipher.getAuthTag().toString('hex') });
}

function decryptPass(stored) {
    if (!stored) return '';
    try {
        const { iv, data, tag } = JSON.parse(stored);
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        let dec = decipher.update(data, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch (e) {
        console.warn('[DB] decryptPass failed:', e.message);
        return '';
    }
}

// Legacy: encryptDevice/decryptDevice para compatibilidad con código que aún las use
function encryptDevice(device) {
    if (!device.sshPass) return device;
    return { ...device, sshPass: undefined, _enc_pass: encryptPass(device.sshPass) };
}

function decryptDevice(device) {
    if (!device._enc_pass) return device;
    const { _enc_pass, ...rest } = device;
    return { ...rest, sshPass: decryptPass(_enc_pass) };
}

// ══════════════════════════════════════════════════════════════════════════
// NODOS — CRUD sobre tabla `nodes` (schema v2)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Guarda o actualiza un nodo. Acepta el formato del frontend:
 * { ppp_user, nombre_nodo, nombre_vrf, iface_name, segmento_lan, ip_tunnel, id (mikrotik), ... }
 */
async function saveNode(nodeData) {
    if (!nodeData?.ppp_user) throw new Error('saveNode: ppp_user requerido');
    const d = await getDb();
    const now = Date.now();

    // Serializar lan_subnets a JSON si es un array
    const lanSubnetsJson = Array.isArray(nodeData.lan_subnets)
        ? JSON.stringify(nodeData.lan_subnets)
        : (nodeData.lan_subnets || '[]');

    const result = await d.run(
        `INSERT INTO nodes (ppp_user, mikrotik_id, nombre_nodo, nombre_vrf, iface_name, segmento_lan,
            ip_tunnel, server_ip, wg_public_key, label, lan_subnets, protocol, node_number,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ppp_user) DO UPDATE SET
            mikrotik_id  = COALESCE(NULLIF(excluded.mikrotik_id, ''), nodes.mikrotik_id),
            nombre_nodo  = excluded.nombre_nodo,
            nombre_vrf   = excluded.nombre_vrf,
            iface_name   = excluded.iface_name,
            segmento_lan = excluded.segmento_lan,
            ip_tunnel    = excluded.ip_tunnel,
            server_ip    = COALESCE(NULLIF(excluded.server_ip, ''), nodes.server_ip),
            wg_public_key = COALESCE(NULLIF(excluded.wg_public_key, ''), nodes.wg_public_key),
            label        = COALESCE(NULLIF(excluded.label, ''), nodes.label),
            lan_subnets  = CASE WHEN excluded.lan_subnets != '[]' THEN excluded.lan_subnets ELSE nodes.lan_subnets END,
            protocol     = COALESCE(NULLIF(excluded.protocol, 'sstp'), nodes.protocol),
            node_number  = COALESCE(excluded.node_number, nodes.node_number),
            updated_at   = excluded.updated_at`,
        [
            nodeData.ppp_user,
            nodeData.id || nodeData.mikrotik_id || '',
            nodeData.nombre_nodo || '',
            nodeData.nombre_vrf || '',
            nodeData.iface_name || '',
            nodeData.segmento_lan || '',
            nodeData.ip_tunnel || '',
            nodeData.server_ip || '',
            nodeData.wg_public_key || '',
            nodeData.label || '',
            lanSubnetsJson,
            nodeData.protocol || 'sstp',
            nodeData.node_number != null ? nodeData.node_number : null,
            now, now
        ]
    );

    // Retornar el nodo completo para el frontend
    const saved = await d.get('SELECT * FROM nodes WHERE ppp_user = ?', [nodeData.ppp_user]);
    return {
        ...nodeData,
        ...saved,
        ppp_user: saved.ppp_user,
        id: saved.mikrotik_id || nodeData.id,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
    };
}

/**
 * Retorna todos los nodos con formato compatible con el frontend.
 */
async function getNodes() {
    const d = await getDb();
    const rows = await d.all(
        `SELECT id, ppp_user, mikrotik_id, nombre_nodo, nombre_vrf, iface_name,
                segmento_lan, ip_tunnel, label, server_ip, wg_public_key,
                ppp_password_enc, lan_subnets, protocol, node_number,
                created_at, updated_at
         FROM nodes ORDER BY id ASC`
    );
    return rows.map(r => ({
        ppp_user: r.ppp_user,
        id: r.mikrotik_id || r.ppp_user,
        _nodeId: r.id,  // INTEGER id interno para FK
        nombre_nodo: r.nombre_nodo,
        nombre_vrf: r.nombre_vrf,
        iface_name: r.iface_name,
        segmento_lan: r.segmento_lan,
        ip_tunnel: r.ip_tunnel,
        label: r.label,
        server_ip: r.server_ip,
        wg_public_key: r.wg_public_key,
        lan_subnets: r.lan_subnets ? JSON.parse(r.lan_subnets) : [],
        protocol: r.protocol || 'sstp',
        node_number: r.node_number,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }));
}

/**
 * Busca un nodo por ppp_user.
 */
async function getNodeByPppUser(pppUser) {
    const d = await getDb();
    return d.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
}

/**
 * Busca el INTEGER id de un nodo por ppp_user.
 */
async function getNodeId(pppUser) {
    const d = await getDb();
    const row = await d.get('SELECT id FROM nodes WHERE ppp_user = ?', [pppUser]);
    return row?.id || null;
}

/**
 * Elimina un nodo. Las FK con ON DELETE CASCADE limpian automáticamente:
 *   node_ssh_creds, node_tags, node_history
 * Torres quedan con node_id = NULL (ON DELETE SET NULL).
 * APs no tienen FK a nodes (usan ap_groups), así que no se afectan.
 */
async function deleteNode(pppUser) {
    if (!pppUser) return { devicesDeleted: 0, deviceIds: [] };
    const d = await getDb();

    const nodeRow = await d.get('SELECT id FROM nodes WHERE ppp_user = ?', [pppUser]);
    if (!nodeRow) return { devicesDeleted: 0, deviceIds: [] };

    // FK CASCADE limpia automáticamente: node_ssh_creds, node_history, node_tags
    // Torres quedan con node_id = NULL (ON DELETE SET NULL)
    // ap_groups NO tienen FK a nodes — no se afectan
    await d.run('DELETE FROM nodes WHERE id = ?', [nodeRow.id]);

    console.log(`[DB] Nodo eliminado (cascade): ${pppUser} — FK limpiaron dependencias`);
    return { devicesDeleted: 0, deviceIds: [] };
}

// ══════════════════════════════════════════════════════════════════════════
// USUARIOS (RBAC)
// ══════════════════════════════════════════════════════════════════════════

async function hasUsers() {
    const d = await getDb();
    const result = await d.get('SELECT COUNT(*) as count FROM vpn_users');
    return result.count > 0;
}

async function getUserByUsername(username) {
    const d = await getDb();
    return d.get('SELECT * FROM vpn_users WHERE username = ?', [username]);
}

async function createUser(username, password_hash, role = 'viewer') {
    const d = await getDb();
    await d.run(
        'INSERT INTO vpn_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
        [username, password_hash, role, Date.now()]
    );
}

// ══════════════════════════════════════════════════════════════════════════
// APP SETTINGS
// ══════════════════════════════════════════════════════════════════════════

async function setAppSetting(key, value) {
    const d = await getDb();
    await d.run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, Date.now()]
    );
}

async function getAppSetting(key) {
    const d = await getDb();
    const result = await d.get('SELECT value FROM app_settings WHERE key = ?', [key]);
    return result ? result.value : null;
}

// ══════════════════════════════════════════════════════════════════════════
// TORRES (v2 — con PTP normalizado)
// ══════════════════════════════════════════════════════════════════════════

async function getTorres() {
    const d = await getDb();
    // Usar la vista v_torre_full que ya hace los JOINs con PTP y nodo
    const rows = await d.all('SELECT * FROM v_torre_full ORDER BY created_at DESC');
    // El frontend espera nodo_id como ppp_user (string), no como INTEGER
    return rows.map(r => ({
        ...r,
        nodo_id: r.nodo_ppp_user || r.nodo_id
    }));
}

async function saveTorre(torreData) {
    if (!torreData?.id || !torreData?.nombre) throw new Error('id y nombre requeridos para la torre');
    const d = await getDb();
    const now = Date.now();

    // Resolver node_id: el frontend envía nodo_id como ppp_user o mikrotik_id
    let nodeId = null;
    if (torreData.nodo_id) {
        const nodeRow = await d.get(
            'SELECT id FROM nodes WHERE ppp_user = ? OR mikrotik_id = ?',
            [torreData.nodo_id, torreData.nodo_id]
        );
        nodeId = nodeRow?.id || null;
    }

    // Upsert torre
    await d.run(
        `INSERT INTO torres (uuid, nombre, ubicacion, tramos, contacto, pdf_path, node_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET
            nombre = excluded.nombre,
            ubicacion = excluded.ubicacion,
            tramos = excluded.tramos,
            contacto = excluded.contacto,
            pdf_path = excluded.pdf_path,
            node_id = excluded.node_id,
            updated_at = excluded.updated_at`,
        [torreData.id, torreData.nombre, torreData.ubicacion || '',
         torreData.tramos || 0, torreData.contacto || '', torreData.pdf_path || '',
         nodeId, torreData.creado_en || now, now]
    );

    // Upsert PTP emisor
    const torreRow = await d.get('SELECT id FROM torres WHERE uuid = ?', [torreData.id]);
    const torreIntId = torreRow.id;

    if (torreData.ptp_emisor_ip || torreData.ptp_emisor_nombre) {
        await d.run(
            `INSERT INTO torre_ptp_endpoints (torre_id, side, ip, nombre, modelo, descripcion)
             VALUES (?, 'emisor', ?, ?, ?, ?)
             ON CONFLICT(torre_id, side) DO UPDATE SET
                ip = excluded.ip, nombre = excluded.nombre,
                modelo = excluded.modelo, descripcion = excluded.descripcion`,
            [torreIntId, torreData.ptp_emisor_ip || '', torreData.ptp_emisor_nombre || '',
             torreData.ptp_emisor_modelo || '', torreData.ptp_emisor_desc || '']
        );
    }

    // Upsert PTP receptor
    if (torreData.ptp_receptor_ip || torreData.ptp_receptor_nombre) {
        await d.run(
            `INSERT INTO torre_ptp_endpoints (torre_id, side, ip, nombre, modelo, descripcion)
             VALUES (?, 'receptor', ?, ?, ?, ?)
             ON CONFLICT(torre_id, side) DO UPDATE SET
                ip = excluded.ip, nombre = excluded.nombre,
                modelo = excluded.modelo, descripcion = excluded.descripcion`,
            [torreIntId, torreData.ptp_receptor_ip || '', torreData.ptp_receptor_nombre || '',
             torreData.ptp_receptor_modelo || '', torreData.ptp_receptor_desc || '']
        );
    }

    return torreData;
}

async function deleteTorre(id) {
    if (!id) return null;
    const d = await getDb();
    const torre = await d.get('SELECT pdf_path FROM torres WHERE uuid = ?', [id]);
    // CASCADE elimina torre_ptp_endpoints automáticamente
    await d.run('DELETE FROM torres WHERE uuid = ?', [id]);
    return torre?.pdf_path || null;
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS para resolución de IDs (uuid ↔ integer)
// ══════════════════════════════════════════════════════════════════════════

async function getApByUuid(uuid) {
    const d = await getDb();
    return d.get('SELECT * FROM aps WHERE uuid = ?', [uuid]);
}

async function getApIntId(uuid) {
    const d = await getDb();
    const row = await d.get('SELECT id FROM aps WHERE uuid = ?', [uuid]);
    return row?.id || null;
}

async function getCpeByMac(mac) {
    const d = await getDb();
    return d.get('SELECT * FROM cpes WHERE mac = ?', [mac.toUpperCase()]);
}

async function getCpeIntId(mac) {
    const d = await getDb();
    const row = await d.get('SELECT id FROM cpes WHERE mac = ?', [mac.toUpperCase()]);
    return row?.id || null;
}

async function getApGroupByUuid(uuid) {
    const d = await getDb();
    return d.get('SELECT * FROM ap_groups WHERE uuid = ?', [uuid]);
}

async function getApGroupIntId(uuid) {
    const d = await getDb();
    const row = await d.get('SELECT id FROM ap_groups WHERE uuid = ?', [uuid]);
    return row?.id || null;
}

module.exports = {
    initDb, getDb,
    encryptPass, decryptPass, encryptDevice, decryptDevice,
    saveNode, getNodes, getNodeByPppUser, getNodeId, deleteNode,
    hasUsers, getUserByUsername, createUser,
    setAppSetting, getAppSetting,
    getTorres, saveTorre, deleteTorre,
    getApByUuid, getApIntId,
    getCpeByMac, getCpeIntId,
    getApGroupByUuid, getApGroupIntId,
};
