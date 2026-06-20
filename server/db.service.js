// ============================================================
//  db.service.js — Capa de datos OPERATIVA sobre MySQL/MariaDB
//
//  Migrado desde SQLite. Expone la MISMA interfaz que usaba el
//  wrapper `sqlite` (getDb() → { get, all, run, exec }) para no
//  tocar las ~136 llamadas SQL repartidas por las rutas, más los
//  helpers de alto nivel (saveNode, getNodes, etc.).
//
//  Traducción de dialecto (SQLite → MySQL) automática en translate():
//    • INSERT OR IGNORE        → INSERT IGNORE
//    • INSERT OR REPLACE       → REPLACE
//    • ON CONFLICT(..) DO UPDATE SET → ON DUPLICATE KEY UPDATE
//    • excluded.col            → VALUES(col)
//    • GROUP_CONCAT(x, ',')    → GROUP_CONCAT(x SEPARATOR ',')
//
//  Transacciones: las rutas hacen run('BEGIN'|'COMMIT'|'ROLLBACK').
//  El shim usa una conexión dedicada con mutex (serializa como el
//  lock de escritura global de SQLite WAL).
//
//  Cifrado AES-256-GCM: idéntico, basado en el archivo .db_secret.
// ============================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getPool } = require('./db/mysql');
const log = require('./lib/logger').child({ scope: 'db-service' });

// ── Directorio de datos y clave de cifrado (sin cambios) ────────────────────
const DATA_DIR    = process.env.DATA_DIR || __dirname;
const SECRET_FILE = path.join(DATA_DIR, '.db_secret');
const SCHEMA_FILE = path.join(__dirname, 'sql', 'schema_ops.sql');
let ENCRYPTION_KEY;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (fs.existsSync(SECRET_FILE)) {
    ENCRYPTION_KEY = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8'), 'hex');
} else {
    ENCRYPTION_KEY = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE, ENCRYPTION_KEY.toString('hex'), { mode: 0o600 });
}

// ══════════════════════════════════════════════════════════════════════════
// TRADUCCIÓN DE DIALECTO + NORMALIZACIÓN DE PARÁMETROS
// ══════════════════════════════════════════════════════════════════════════

function translate(sql) {
    if (typeof sql !== 'string') return sql;
    let s = sql;
    s = s.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT IGNORE');
    s = s.replace(/INSERT\s+OR\s+REPLACE/gi, 'REPLACE');
    if (/ON\s+CONFLICT/i.test(s)) {
        s = s.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
        s = s.replace(/\bexcluded\.([A-Za-z_]\w*)/gi, 'VALUES($1)');
    }
    // GROUP_CONCAT(expr, 'sep') → GROUP_CONCAT(expr SEPARATOR 'sep')
    s = s.replace(/GROUP_CONCAT\(\s*([^,()]+?)\s*,\s*('[^']*')\s*\)/gi, 'GROUP_CONCAT($1 SEPARATOR $2)');
    return s;
}

// El wrapper sqlite aceptaba .run(sql, a, b, c) | .run(sql, [a,b,c]) | .run(sql, scalar)
function normParams(rest) {
    let params;
    if (rest.length === 1 && Array.isArray(rest[0])) params = rest[0];
    else params = rest;
    // mysql2 rechaza `undefined` → mapear a null (SQLite lo toleraba)
    return params.map(v => (v === undefined ? null : v));
}

// ══════════════════════════════════════════════════════════════════════════
// SHIM DE CONEXIÓN — emula la API de `sqlite`
// ══════════════════════════════════════════════════════════════════════════

let _txnConn = null;        // conexión dedicada mientras hay transacción activa
let _txnRelease = null;     // libera el siguiente BEGIN en cola
let _txnChain = Promise.resolve();  // mutex: serializa transacciones

function execQuery(sql, params) {
    const conn = _txnConn || getPool();
    return conn.query(sql, params);
}

async function _begin() {
    let release;
    const ready = new Promise(res => { release = res; });
    const myTurn = _txnChain;
    _txnChain = _txnChain.then(() => ready);   // el próximo BEGIN espera a este release()
    await myTurn;
    _txnConn = await getPool().getConnection();
    await _txnConn.query('START TRANSACTION');
    _txnRelease = release;
}

async function _end(commit) {
    const c = _txnConn, rel = _txnRelease;
    _txnConn = null; _txnRelease = null;
    if (c) {
        try { await c.query(commit ? 'COMMIT' : 'ROLLBACK'); }
        finally { c.release(); }
    }
    if (rel) rel();
}

const shim = {
    async all(sql, ...rest) {
        const [rows] = await execQuery(translate(sql), normParams(rest));
        return rows;
    },
    async get(sql, ...rest) {
        const [rows] = await execQuery(translate(sql), normParams(rest));
        return rows[0];
    },
    async run(sql, ...rest) {
        const t = sql.trim().toUpperCase().replace(/;$/, '');
        if (t === 'BEGIN' || t === 'BEGIN TRANSACTION' || t === 'START TRANSACTION') {
            await _begin(); return { changes: 0, lastID: 0 };
        }
        if (t === 'COMMIT') { await _end(true);  return { changes: 0, lastID: 0 }; }
        if (t === 'ROLLBACK') { await _end(false); return { changes: 0, lastID: 0 }; }
        const [r] = await execQuery(translate(sql), normParams(rest));
        return { changes: r.affectedRows ?? 0, lastID: r.insertId ?? 0 };
    },
    async exec(sql) {
        // multi-statement (DDL): dividir y ejecutar secuencialmente
        const stmts = splitStatements(sql);
        for (const stmt of stmts) await execQuery(translate(stmt), []);
    },
};

function splitStatements(raw) {
    return raw
        .split('\n')
        // Quita comentarios -- (de línea e inline). CRÍTICO: un comentario inline
        // con ';' (ej. schema_ops "-- (Fase 2-B; resuelto...)") rompería el split(';')
        // y truncaría el CREATE TABLE (aps) → FK errno 150 / tabla inexistente.
        .map(line => line.replace(/--.*$/, ''))
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

// ══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN — crea el schema operativo en MySQL (idempotente)
// ══════════════════════════════════════════════════════════════════════════

let _initialized = false;

async function initDb() {
    if (_initialized) return shim;
    // Verifica conectividad MySQL
    await getPool().query('SELECT 1');

    if (fs.existsSync(SCHEMA_FILE)) {
        const raw = fs.readFileSync(SCHEMA_FILE, 'utf8');
        const stmts = splitStatements(raw);
        for (const stmt of stmts) {
            try { await getPool().query(stmt); }
            catch (e) {
                if (!/already exists|Duplicate/i.test(e.message)) {
                    log.warn({ err: e.message.substring(0, 120) }, 'schema_ops aviso');
                }
            }
        }
    }

    // Fase 2-B: asegurar la columna aps.node_id en instalaciones existentes.
    // CREATE TABLE IF NOT EXISTS no añade columnas a tablas ya creadas, así que
    // la añadimos aquí de forma idempotente (auto-heal en cada boot). El backfill
    // completo (incluye resolución por subred) lo hace `npm run migrate:apnode`.
    try {
        const dbName = process.env.MYSQL_DATABASE || 'vpn_manager';
        const [col] = await getPool().query(
            `SELECT 1 FROM information_schema.COLUMNS
              WHERE table_schema = ? AND table_name = 'aps' AND column_name = 'node_id' LIMIT 1`,
            [dbName]
        );
        if (col.length === 0) {
            await getPool().query('ALTER TABLE aps ADD COLUMN node_id INT DEFAULT NULL');
            await getPool().query('ALTER TABLE aps ADD KEY idx_aps_node (node_id)').catch(() => {});
            await getPool().query(
                'ALTER TABLE aps ADD CONSTRAINT fk_ap_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL'
            ).catch(() => {});
            // Backfill rápido por nombre_nodo (la resolución por subred la hace migrate:apnode)
            await getPool().query(
                `UPDATE aps a JOIN nodes n ON a.nombre_nodo = n.nombre_nodo
                    SET a.node_id = n.id
                  WHERE a.node_id IS NULL AND a.nombre_nodo <> ''`
            ).catch(() => {});
            log.info('Columna aps.node_id añadida (Fase 2-B) + backfill por nombre_nodo');
        }
    } catch (e) {
        log.warn({ err: e.message.substring(0, 120) }, 'ensure aps.node_id aviso');
    }

    // Auto-gen llaves WG del CPE: asegurar columnas wg_cpe_public / wg_cpe_private_enc
    // en instalaciones existentes (CREATE TABLE IF NOT EXISTS no añade columnas).
    // Idempotente en cada boot; el backfill no aplica (las llaves se generan al
    // (re)provisionar o regenerar el script de un nodo WG).
    try {
        const dbName = process.env.MYSQL_DATABASE || 'vpn_manager';
        for (const [name, ddl] of [
            ['wg_cpe_public', "ADD COLUMN wg_cpe_public VARCHAR(255) NOT NULL DEFAULT ''"],
            ['wg_cpe_private_enc', 'ADD COLUMN wg_cpe_private_enc TEXT DEFAULT NULL'],
        ]) {
            const [col] = await getPool().query(
                `SELECT 1 FROM information_schema.COLUMNS
                  WHERE table_schema = ? AND table_name = 'nodes' AND column_name = ? LIMIT 1`,
                [dbName, name]
            );
            if (col.length === 0) {
                await getPool().query(`ALTER TABLE nodes ${ddl}`);
                log.info(`Columna nodes.${name} añadida (auto-gen llaves WG del CPE)`);
            }
        }
    } catch (e) {
        log.warn({ err: e.message.substring(0, 120) }, 'ensure nodes.wg_cpe_* aviso');
    }

    // Purgar historial de señal > 30 días
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    await getPool().query('DELETE FROM signal_history WHERE timestamp < ?', [thirtyDaysAgo]).catch(() => {});

    _initialized = true;
    log.info('Base de datos MySQL (operativa) conectada y validada');
    return shim;
}

async function getDb() {
    if (!_initialized) await initDb();
    return shim;
}

// ══════════════════════════════════════════════════════════════════════════
// CIFRADO AES-256-GCM (sin cambios)
// ══════════════════════════════════════════════════════════════════════════

// authTagLength = 16 obliga a que el tag sea de 128 bits (longitud máxima de
// GCM). Sin esto, Node acepta tags truncados de hasta 4 bytes — un atacante
// podría intentar bypasses con tags más cortos. Defensa en profundidad
// (encryptPass siempre escribe 16 bytes; aquí blindamos la validación).
const GCM_OPTS = { authTagLength: 16 };

function encryptPass(plaintext) {
    if (!plaintext) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv, GCM_OPTS);
    let enc = cipher.update(plaintext, 'utf8', 'hex');
    enc += cipher.final('hex');
    return JSON.stringify({ iv: iv.toString('hex'), data: enc, tag: cipher.getAuthTag().toString('hex') });
}

function decryptPass(stored) {
    if (!stored) return '';
    try {
        const { iv, data, tag } = JSON.parse(stored);
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'hex'), GCM_OPTS);
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        let dec = decipher.update(data, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch (e) {
        log.warn({ err: e.message }, 'decryptPass falló');
        return '';
    }
}

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
// NODOS — CRUD sobre tabla `nodes`
// ══════════════════════════════════════════════════════════════════════════

async function saveNode(nodeData) {
    if (!nodeData?.ppp_user) throw new Error('saveNode: ppp_user requerido');
    const d = await getDb();
    const now = Date.now();

    const lanSubnetsJson = Array.isArray(nodeData.lan_subnets)
        ? JSON.stringify(nodeData.lan_subnets)
        : (nodeData.lan_subnets || '[]');

    await d.run(
        `INSERT INTO nodes (ppp_user, mikrotik_id, nombre_nodo, nombre_vrf, iface_name, segmento_lan,
            ip_tunnel, server_ip, wg_public_key, wg_cpe_public, wg_cpe_private_enc, label, lan_subnets, protocol, node_number, workspace_id,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ppp_user) DO UPDATE SET
            mikrotik_id  = COALESCE(NULLIF(excluded.mikrotik_id, ''), nodes.mikrotik_id),
            nombre_nodo  = excluded.nombre_nodo,
            nombre_vrf   = excluded.nombre_vrf,
            iface_name   = excluded.iface_name,
            segmento_lan = excluded.segmento_lan,
            ip_tunnel    = excluded.ip_tunnel,
            server_ip    = COALESCE(NULLIF(excluded.server_ip, ''), nodes.server_ip),
            wg_public_key = COALESCE(NULLIF(excluded.wg_public_key, ''), nodes.wg_public_key),
            wg_cpe_public = COALESCE(NULLIF(excluded.wg_cpe_public, ''), nodes.wg_cpe_public),
            wg_cpe_private_enc = COALESCE(excluded.wg_cpe_private_enc, nodes.wg_cpe_private_enc),
            label        = COALESCE(NULLIF(excluded.label, ''), nodes.label),
            lan_subnets  = CASE WHEN excluded.lan_subnets != '[]' THEN excluded.lan_subnets ELSE nodes.lan_subnets END,
            protocol     = COALESCE(NULLIF(excluded.protocol, 'sstp'), nodes.protocol),
            node_number  = COALESCE(excluded.node_number, nodes.node_number),
            workspace_id = COALESCE(nodes.workspace_id, excluded.workspace_id),
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
            nodeData.wg_cpe_public || '',
            nodeData.wg_cpe_private_enc || null,
            nodeData.label || '',
            lanSubnetsJson,
            nodeData.protocol || 'sstp',
            nodeData.node_number != null ? nodeData.node_number : null,
            nodeData.workspace_id || null,
            now, now
        ]
    );

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

async function getNodes() {
    const d = await getDb();
    const rows = await d.all(
        `SELECT id, ppp_user, mikrotik_id, nombre_nodo, nombre_vrf, iface_name,
                segmento_lan, ip_tunnel, label, server_ip, wg_public_key,
                ppp_password_enc, lan_subnets, protocol, node_number, workspace_id,
                created_at, updated_at
         FROM nodes ORDER BY id ASC`
    );
    return rows.map(r => ({
        ppp_user: r.ppp_user,
        id: r.mikrotik_id || r.ppp_user,
        _nodeId: r.id,
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
        workspace_id: r.workspace_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }));
}

async function getNodeByPppUser(pppUser) {
    const d = await getDb();
    return d.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
}

async function getNodeId(pppUser) {
    const d = await getDb();
    const row = await d.get('SELECT id FROM nodes WHERE ppp_user = ?', [pppUser]);
    return row?.id || null;
}

async function deleteNode(pppUser) {
    if (!pppUser) return { devicesDeleted: 0, deviceIds: [] };
    const d = await getDb();
    const nodeRow = await d.get('SELECT id FROM nodes WHERE ppp_user = ?', [pppUser]);
    if (!nodeRow) return { devicesDeleted: 0, deviceIds: [] };
    await d.run('DELETE FROM nodes WHERE id = ?', [nodeRow.id]);
    log.debug({ pppUser }, 'Nodo eliminado (cascade): FK limpiaron dependencias');
    return { devicesDeleted: 0, deviceIds: [] };
}

// ══════════════════════════════════════════════════════════════════════════
// USUARIOS legacy (bootstrap admin) — tabla vpn_users en MySQL
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
// APP SETTINGS  (`key` es palabra reservada en MySQL → backticks)
// ══════════════════════════════════════════════════════════════════════════

async function setAppSetting(key, value) {
    const d = await getDb();
    await d.run(
        'INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)',
        [key, value, Date.now()]
    );
}

async function getAppSetting(key) {
    const d = await getDb();
    const result = await d.get('SELECT value FROM app_settings WHERE `key` = ?', [key]);
    return result ? result.value : null;
}

// ══════════════════════════════════════════════════════════════════════════
// TORRES (con PTP normalizado)
// ══════════════════════════════════════════════════════════════════════════

async function getTorres() {
    const d = await getDb();
    const rows = await d.all('SELECT * FROM v_torre_full ORDER BY created_at DESC');
    return rows.map(r => ({ ...r, nodo_id: r.nodo_ppp_user || r.nodo_id }));
}

async function saveTorre(torreData) {
    if (!torreData?.id || !torreData?.nombre) throw new Error('id y nombre requeridos para la torre');
    const d = await getDb();
    const now = Date.now();

    let nodeId = null;
    if (torreData.nodo_id) {
        const nodeRow = await d.get(
            'SELECT id FROM nodes WHERE ppp_user = ? OR mikrotik_id = ?',
            [torreData.nodo_id, torreData.nodo_id]
        );
        nodeId = nodeRow?.id || null;
    }

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
    await d.run('DELETE FROM torres WHERE uuid = ?', [id]);
    return torre?.pdf_path || null;
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS de resolución de IDs (uuid ↔ integer)
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
