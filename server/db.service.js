const crypto = require('crypto');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const SECRET_FILE = './.db_secret';
let ENCRYPTION_KEY;

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
        filename: './database.sqlite',
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
    `);
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

module.exports = { initDb, getDb, encryptDevice, decryptDevice, encryptPass, decryptPass };