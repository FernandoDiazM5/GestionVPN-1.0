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
    fs.writeFileSync(SECRET_FILE, ENCRYPTION_KEY.toString('hex'), { mode: 0o600 });
}

let db;

async function initDb() {
    db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });

    // Activar soporte para alta concurrencia y foreign keys
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA synchronous = NORMAL;');
    await db.exec('PRAGMA foreign_keys = ON;');

    // Usamos una columna 'data' en texto para guardar todo el JSON de los equipos
    // y nodos de forma flexible, facilitando la extracción y guardado.
    await db.exec(`
        -- DEPRECADA v3.2: Los APs ahora se almacenan en la tabla 'aps' (device.routes.js).
        -- Esta tabla se mantiene vacía por compatibilidad retroactiva con el código de migración Phase 3.
        -- NO escribir aquí nuevos registros.
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
            wifi_password TEXT DEFAULT '',
            cpes_conectados_count INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1,
            last_saved INTEGER NOT NULL,
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
        CREATE TABLE IF NOT EXISTS vpn_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            created_at INTEGER NOT NULL
        );
    `);
    // Migraciones: añadir columnas si la tabla ya existía sin ellas
    const migrate = async (sql) => {
        try { await db.run(sql); } catch (e) {
            if (!e.message?.includes('duplicate column')) console.error('[DB] Migration error:', e.message);
        }
    };
    await migrate("ALTER TABLE node_ssh_creds ADD COLUMN ssh_creds TEXT DEFAULT '[]'");
    // last_stats: JSON completo de la última lectura wstalist/sta.cgi para cada CPE
    await migrate("ALTER TABLE cpes_conocidos ADD COLUMN last_stats TEXT DEFAULT NULL");
    // remote_hostname / remote_platform: nombre y modelo del equipo remoto (CPE)
    await migrate("ALTER TABLE cpes_conocidos ADD COLUMN remote_hostname TEXT DEFAULT ''");
    await migrate("ALTER TABLE cpes_conocidos ADD COLUMN remote_platform TEXT DEFAULT ''");

    // Normalización Phase 3: Columnas explícitas para alto rendimiento
    await migrate("ALTER TABLE nodes ADD COLUMN nombre_nodo TEXT DEFAULT ''");
    await migrate("ALTER TABLE nodes ADD COLUMN nombre_vrf TEXT DEFAULT ''");
    await migrate("ALTER TABLE nodes ADD COLUMN iface_name TEXT DEFAULT ''");
    await migrate("ALTER TABLE nodes ADD COLUMN segmento_lan TEXT DEFAULT ''");
    await migrate("ALTER TABLE nodes ADD COLUMN ip_tunnel TEXT DEFAULT ''");
    
    await migrate("ALTER TABLE devices ADD COLUMN node_id TEXT DEFAULT ''");
    await migrate("ALTER TABLE devices ADD COLUMN ip TEXT DEFAULT ''");
    await migrate("ALTER TABLE devices ADD COLUMN mac TEXT DEFAULT ''");

    // Phase 4: Nuevas columnas aps — partición SQLite/IndexedDB
    await migrate("ALTER TABLE aps ADD COLUMN wifi_password TEXT DEFAULT ''");
    await migrate("ALTER TABLE aps ADD COLUMN cpes_conectados_count INTEGER DEFAULT 0");
    await migrate("ALTER TABLE aps ADD COLUMN last_saved INTEGER DEFAULT 0");

    // Phase 5: Credenciales SSH propias de cada CPE (distintas de las del AP padre)
    await migrate("ALTER TABLE cpes_conocidos ADD COLUMN usuario_ssh TEXT DEFAULT ''");
    await migrate("ALTER TABLE cpes_conocidos ADD COLUMN clave_ssh TEXT DEFAULT NULL");
    await migrate("ALTER TABLE cpes_conocidos ADD COLUMN puerto_ssh INTEGER DEFAULT 22");

    // Backfill de datos JSON a las nuevas columnas
    try {
        const unmigratedN = await db.all("SELECT id, data FROM nodes WHERE nombre_nodo IS NULL OR nombre_nodo = ''");
        if (unmigratedN.length) console.log(`[DB] Migrando ${unmigratedN.length} nodos a DB estructurada...`);
        for (const r of unmigratedN) {
            if (!r.data) continue;
            try {
                const p = JSON.parse(r.data);
                await db.run(
                    `UPDATE nodes SET nombre_nodo=?, nombre_vrf=?, iface_name=?, segmento_lan=?, ip_tunnel=? WHERE id=?`,
                    [p.nombre_nodo || '', p.nombre_vrf || '', p.iface_name || '', p.segmento_lan || '', p.ip_tunnel || '', r.id]
                );
            } catch(e) { console.error('[DB] Error en migración:', e.message); }
        }
        
        const unmigratedD = await db.all("SELECT id, data FROM devices WHERE node_id IS NULL OR node_id = ''");
        if (unmigratedD.length) console.log(`[DB] Migrando ${unmigratedD.length} dispositivos a DB estructurada...`);
        for (const r of unmigratedD) {
            if (!r.data) continue;
            try {
                const p = JSON.parse(r.data);
                await db.run(`UPDATE devices SET node_id=?, ip=?, mac=? WHERE id=?`, [p.nodeId || '', p.ip || '', p.mac || '', r.id]);
            } catch(e) { console.error('[DB] Error en migración:', e.message); }
        }
    } catch(e) { console.error('[DB] Error en Phase 3 Migration', e); }

    // B15: Índices para performance
    await db.run('CREATE INDEX IF NOT EXISTS idx_aps_nodo ON aps(nodo_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_aps_activo ON aps(activo)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_cpes_apid ON cpes_conocidos(ap_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_hist_mac_ts ON historial_senal(cpe_mac, timestamp DESC)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_hist_apid ON historial_senal(ap_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_node_labels_ppp ON node_labels(ppp_user)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_node_creds_ppp ON node_creds(ppp_user)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_node_history_ppp ON node_history(ppp_user)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_vpn_users_username ON vpn_users(username)');

    // B16: Purgar historial más antiguo de 30 días
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    await db.run('DELETE FROM historial_senal WHERE timestamp < ?', [thirtyDaysAgo]);

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
        console.error('[DB] encryptPass error:', e.message);
        throw e;
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
    } catch (e) {
        console.warn('[DB] decryptPass failed:', e.message);
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
        `INSERT INTO nodes (id, data, nombre_nodo, nombre_vrf, iface_name, segmento_lan, ip_tunnel) 
         VALUES (?, ?, ?, ?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET 
            data = excluded.data, 
            nombre_nodo = excluded.nombre_nodo,
            nombre_vrf = excluded.nombre_vrf,
            iface_name = excluded.iface_name,
            segmento_lan = excluded.segmento_lan,
            ip_tunnel = excluded.ip_tunnel`,
        [
            nodeData.ppp_user, 
            JSON.stringify(merged),
            merged.nombre_nodo || '',
            merged.nombre_vrf || '',
            merged.iface_name || '',
            merged.segmento_lan || '',
            merged.ip_tunnel || ''
        ]
    );
    return merged;
}

/**
 * Retorna todos los nodos guardados en SQLite, ordenados por fecha de creación.
 */
async function getNodes() {
    const db = await getDb();
    const rows = await db.all('SELECT id, nombre_nodo, nombre_vrf, iface_name, segmento_lan, ip_tunnel, data FROM nodes ORDER BY rowid ASC');
    return rows.map(r => {
        let parsed = {};
        try { if (r.data) parsed = JSON.parse(r.data); } catch { }
        return {
            ...parsed,
            ppp_user: r.id,
            nombre_nodo: r.nombre_nodo || parsed.nombre_nodo,
            nombre_vrf: r.nombre_vrf || parsed.nombre_vrf,
            iface_name: r.iface_name || parsed.iface_name,
            segmento_lan: r.segmento_lan || parsed.segmento_lan,
            ip_tunnel: r.ip_tunnel || parsed.ip_tunnel,
        };
    }).filter(Boolean);
}

/**
 * Elimina un nodo de SQLite y hace cascade delete en todas las tablas relacionadas.
 * @param {string} pppUser
 */
async function deleteNode(pppUser) {
    if (!pppUser) return { devicesDeleted: 0, deviceIds: [] };
    const db = await getDb();

    // nodes.id = ppp_user, pero nodes.data.id = MikroTik .id (ej: "*17").
    // La tabla aps.nodo_id almacena el MikroTik .id (viene del frontend como node.id).
    // Primero leemos el nodo para obtener su MikroTik .id.
    let mikrotikId = null;
    const nodeRow = await db.get('SELECT data FROM nodes WHERE id = ?', [pppUser]);
    if (nodeRow) {
        try { mikrotikId = JSON.parse(nodeRow.data).id; } catch { /* ignore */ }
    }

    // Buscar APs en tabla aps por nodo_id (MikroTik .id) o ppp_user (fallback)
    const searchIds = [pppUser];
    if (mikrotikId) searchIds.push(String(mikrotikId));
    const ph = searchIds.map(() => '?').join(',');
    const apRows = await db.all(`SELECT id FROM aps WHERE nodo_id IN (${ph})`, searchIds);
    const apIds = apRows.map(r => r.id);

    // También buscar en tabla devices legacy (por si hay datos remanentes)
    let legacyIds = [];
    if (mikrotikId) {
        const legacyRows = await db.all(
            "SELECT id FROM devices WHERE node_id = ? OR (data IS NOT NULL AND JSON_VALID(data) AND JSON_EXTRACT(data, '$.nodeId') = ?)",
            [String(mikrotikId), String(mikrotikId)]
        );
        legacyIds = legacyRows.map(r => r.id);
    }

    const allDeviceIds = [...new Set([...apIds, ...legacyIds])];

    const deletions = [
        db.run('DELETE FROM nodes          WHERE id       = ?', [pppUser]),
        db.run('DELETE FROM node_labels    WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_creds     WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_tags      WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_history   WHERE ppp_user = ?', [pppUser]),
        db.run('DELETE FROM node_ssh_creds WHERE ppp_user = ?', [pppUser]),
    ];

    // Cascade: aps + devices legacy + CPEs + historial
    if (allDeviceIds.length > 0) {
        const devPh = allDeviceIds.map(() => '?').join(',');
        deletions.push(
            db.run(`DELETE FROM aps              WHERE id    IN (${devPh})`, allDeviceIds),
            db.run(`DELETE FROM devices          WHERE id    IN (${devPh})`, allDeviceIds),
            db.run(`DELETE FROM historial_senal  WHERE ap_id IN (${devPh})`, allDeviceIds),
            db.run(`DELETE FROM cpes_conocidos   WHERE ap_id IN (${devPh})`, allDeviceIds),
        );
    }

    await Promise.all(deletions);
    console.log(`[DB] Nodo eliminado (cascade): ${pppUser} (mikrotikId=${mikrotikId}) — ${allDeviceIds.length} APs eliminados`);
    return { devicesDeleted: allDeviceIds.length, deviceIds: allDeviceIds };
}

// ── Gestión de Usuarios (RBAC) ────────────────────────────────────────────

async function hasUsers() {
    const db = await getDb();
    const result = await db.get('SELECT COUNT(*) as count FROM vpn_users');
    return result.count > 0;
}

async function getUserByUsername(username) {
    const db = await getDb();
    return db.get('SELECT * FROM vpn_users WHERE username = ?', [username]);
}

async function createUser(username, password_hash, role = 'viewer') {
    const db = await getDb();
    await db.run('INSERT INTO vpn_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)', 
        [username, password_hash, role, Date.now()]
    );
}

// ── Gestión App Settings (Credenciales MikroTik Ocultas) ────────────────

async function setAppSetting(key, value) {
    const db = await getDb();
    await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

async function getAppSetting(key) {
    const db = await getDb();
    const result = await db.get('SELECT value FROM app_settings WHERE key = ?', [key]);
    return result ? result.value : null;
}

module.exports = { 
    initDb, getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, 
    saveNode, getNodes, deleteNode,
    hasUsers, getUserByUsername, createUser, setAppSetting, getAppSetting
};