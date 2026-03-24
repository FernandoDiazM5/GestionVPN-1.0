const crypto = require('crypto');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// En Docker se monta un volumen en /data para persistir la BD y la clave.
// En desarrollo local se usa el directorio actual.
const DATA_DIR    = process.env.DATA_DIR || '.';
const SECRET_FILE = `${DATA_DIR}/.db_secret`;
const DB_FILE     = `${DATA_DIR}/database.sqlite`;
let ENCRYPTION_KEY;

// Crea el directorio de datos si no existe (útil en Docker)
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Genera o lee una llave de cifrado permanente para la base de datos
if (fs.existsSync(SECRET_FILE)) {
    ENCRYPTION_KEY = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8'), 'hex');
} else {
    ENCRYPTION_KEY = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE, ENCRYPTION_KEY.toString('hex'));
}

let db;

async function initDb() {
    db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });

    // Usamos una columna 'data' en texto para guardar todo el JSON de los equipos
    // y nodos de forma flexible, facilitando la extracción y guardado.
    await db.exec(`
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            data TEXT
        );
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            data TEXT
        );
        CREATE TABLE IF NOT EXISTS node_creds (
            ppp_user TEXT PRIMARY KEY,
            ppp_password TEXT
        );
        CREATE TABLE IF NOT EXISTS peer_colors (
            peer_address TEXT PRIMARY KEY,
            color TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ap_nodos (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            descripcion TEXT DEFAULT '',
            ubicacion TEXT DEFAULT '',
            creado_en INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS aps (
            id TEXT PRIMARY KEY,
            nodo_id TEXT NOT NULL,
            hostname TEXT DEFAULT '',
            modelo TEXT DEFAULT '',
            firmware TEXT DEFAULT '',
            mac_lan TEXT DEFAULT '',
            mac_wlan TEXT DEFAULT '',
            ip TEXT NOT NULL,
            frecuencia_ghz REAL,
            ssid TEXT DEFAULT '',
            canal_mhz INTEGER,
            tx_power INTEGER,
            modo_red TEXT DEFAULT '',
            usuario_ssh TEXT DEFAULT '',
            clave_ssh TEXT,
            puerto_ssh INTEGER DEFAULT 22,
            activo INTEGER DEFAULT 1,
            registrado_en INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cpes_conocidos (
            mac TEXT PRIMARY KEY,
            ap_id TEXT,
            hostname TEXT DEFAULT '',
            modelo TEXT DEFAULT '',
            firmware TEXT DEFAULT '',
            ip_lan TEXT DEFAULT '',
            mac_lan TEXT DEFAULT '',
            mac_wlan TEXT DEFAULT '',
            mac_ap TEXT DEFAULT '',
            modo_red TEXT DEFAULT '',
            frecuencia_mhz INTEGER,
            canal_mhz INTEGER,
            tx_power INTEGER,
            ssid_ap TEXT DEFAULT '',
            ultima_vez_visto INTEGER
        );
        CREATE TABLE IF NOT EXISTS historial_senal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cpe_mac TEXT NOT NULL,
            ap_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            signal_dbm INTEGER,
            remote_signal_dbm INTEGER,
            noisefloor_dbm INTEGER,
            cinr_db REAL,
            ccq_pct REAL,
            distancia_km REAL,
            downlink_mbps REAL,
            uplink_mbps REAL,
            airtime_tx REAL,
            airtime_rx REAL
        );
        CREATE TABLE IF NOT EXISTS node_tags (
            ppp_user TEXT PRIMARY KEY,
            tags TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS node_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ppp_user TEXT NOT NULL,
            event TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS node_labels (
            ppp_user TEXT PRIMARY KEY,
            label TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS node_ssh_creds (
            ppp_user TEXT PRIMARY KEY,
            ssh_user TEXT DEFAULT '',
            ssh_pass TEXT DEFAULT '',
            ssh_creds TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );
    `);
    // Migración: añadir ssh_creds si la tabla ya existía sin esa columna
    try { await db.run("ALTER TABLE node_ssh_creds ADD COLUMN ssh_creds TEXT DEFAULT '[]'"); } catch { /* ya existe */ }
    console.log('[DB] Base de datos SQLite conectada y tablas validadas.');
}

async function getDb() {
    if (!db) await initDb();
    return db;
}

function encryptDevice(device) {
    if (!device.sshPass) return device;
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(device.sshPass, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        return { ...device, sshPass: undefined, _enc: { iv: iv.toString('hex'), data: encrypted, tag: authTag } };
    } catch (e) {
        console.error('[DB] Error cifrando contraseña', e);
        return device;
    }
}

function decryptDevice(device) {
    if (!device._enc) return device;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(device._enc.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(device._enc.tag, 'hex'));
        let decrypted = decipher.update(device._enc.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        const { _enc, ...rest } = device;
        return { ...rest, sshPass: decrypted };
    } catch (err) {
        console.error('[DB] Error descifrando dispositivo', device.id);
        return device; // Retorna sin contraseña si falla
    }
}

function encryptPass(plaintext) {
    if (!plaintext) return null;
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        let enc = cipher.update(plaintext, 'utf8', 'hex');
        enc += cipher.final('hex');
        return JSON.stringify({ iv: iv.toString('hex'), data: enc, tag: cipher.getAuthTag().toString('hex') });
    } catch (e) {
        console.error('[DB] encryptPass error', e);
        return null;
    }
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
    } catch {
        return '';
    }
}

// ── Gestión de nodos en SQLite ────────────────────────────────────────────

/**
 * Guarda o actualiza un nodo en la tabla `nodes`.
 * Hace merge inteligente: si el nodo ya existe, actualiza sólo los campos provistos.
 * @param {object} nodeData  Debe incluir al menos `ppp_user`.
 */
async function saveNode(nodeData) {
    if (!nodeData?.ppp_user) throw new Error('saveNode: ppp_user requerido');
    const db = await getDb();
    const now = Date.now();
    const existing = await db.get('SELECT data FROM nodes WHERE id = ?', [nodeData.ppp_user]);
    let merged;
    if (existing) {
        const prev = JSON.parse(existing.data || '{}');
        // No sobreescribir created_at al actualizar
        merged = { ...prev, ...nodeData, updated_at: now };
    } else {
        merged = { ...nodeData, created_at: now, updated_at: now };
    }
    await db.run(
        'INSERT INTO nodes (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
        [nodeData.ppp_user, JSON.stringify(merged)]
    );
    return merged;
}

/**
 * Retorna todos los nodos guardados en SQLite, ordenados por fecha de creación.
 */
async function getNodes() {
    const db = await getDb();
    const rows = await db.all('SELECT data FROM nodes ORDER BY rowid ASC');
    return rows
        .map(r => { try { return JSON.parse(r.data); } catch { return null; } })
        .filter(Boolean);
}

/**
 * Elimina un nodo de SQLite y hace cascade delete en todas las tablas relacionadas.
 * @param {string} pppUser
 */
async function deleteNode(pppUser) {
    if (!pppUser) return;
    const db = await getDb();
    await Promise.all([
        db.run('DELETE FROM nodes          WHERE id       = ?', [pppUser]),
        db.run('DELETE FROM node_labels    WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_creds     WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_tags      WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_history   WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_ssh_creds WHERE ppp_user = ?', [pppUser]),
    ]);
    console.log(`[DB] Nodo eliminado (cascade): ${pppUser}`);
}

module.exports = { initDb, getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, saveNode, getNodes, deleteNode };