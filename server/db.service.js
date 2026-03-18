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

module.exports = { initDb, getDb, encryptDevice, decryptDevice };