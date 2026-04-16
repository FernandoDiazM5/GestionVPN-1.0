-- ============================================================
-- MikroTik VPN Manager — Schema v2.0 (Normalizado)
-- Arquitecto: Análisis completo de 176+ queries, 15 tablas legacy
--
-- Principios aplicados:
--   • 1NF/2NF/3NF estricta — cero redundancia
--   • INTEGER PK AUTOINCREMENT + UUID UNIQUE para API externa
--   • FK con ON DELETE CASCADE/SET NULL
--   • snake_case uniforme
--   • Columnas de auditoría (created_at, updated_at)
--   • Booleanos como INTEGER 0/1
--   • Passwords cifradas con sufijo _enc
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  TABLAS PRINCIPALES                                         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 1. Nodos VPN (túneles PPPoE / PPP) ─────────────────────────
-- Consolida: nodes, node_labels, node_creds
-- Elimina la columna `data` (JSON blob) → columnas explícitas
CREATE TABLE IF NOT EXISTS nodes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ppp_user        TEXT    UNIQUE NOT NULL,              -- username PPP (era el PK textual)
    mikrotik_id     TEXT    NOT NULL DEFAULT '',           -- RouterOS .id interno (ej: "*17")
    nombre_nodo     TEXT    NOT NULL DEFAULT '',
    nombre_vrf      TEXT    NOT NULL DEFAULT '',
    iface_name      TEXT    NOT NULL DEFAULT '',
    segmento_lan    TEXT    NOT NULL DEFAULT '',
    ip_tunnel       TEXT    NOT NULL DEFAULT '',
    ppp_password_enc TEXT   DEFAULT NULL,                  -- AES-256-GCM cifrada (ex node_creds)
    label           TEXT    NOT NULL DEFAULT '',           -- etiqueta visual (ex node_labels)
    -- Campos extra que venían en el JSON `data`
    server_ip       TEXT    NOT NULL DEFAULT '',           -- IP pública del servidor
    wg_public_key   TEXT    NOT NULL DEFAULT '',           -- WireGuard public key del nodo
    lan_subnets     TEXT    NOT NULL DEFAULT '[]',        -- JSON array de subredes LAN
    protocol        TEXT    NOT NULL DEFAULT 'sstp',       -- 'sstp' | 'wireguard'
    node_number     INTEGER DEFAULT NULL,                  -- Número ordinal del nodo (ej: 3 para ND3)
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── 2. Credenciales SSH por nodo (múltiples por nodo) ───────────
-- Normaliza node_ssh_creds.ssh_creds (JSON array) → filas individuales
CREATE TABLE IF NOT EXISTS node_ssh_creds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id         INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    ssh_user        TEXT    NOT NULL DEFAULT 'ubnt',
    ssh_pass_enc    TEXT    DEFAULT NULL,                  -- AES-256-GCM cifrada
    ssh_port        INTEGER NOT NULL DEFAULT 22,
    priority        INTEGER NOT NULL DEFAULT 0,            -- 0 = primaria, 1+ = fallback
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(node_id, priority)
);

-- ── 3. Sistema de tags (normalizado con tabla puente) ───────────
-- Elimina el JSON '["tag1","tag2"]' por relaciones N:M
CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS node_tags (
    node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (node_id, tag_id)
);

-- ── 4. Historial de eventos de nodos ────────────────────────────
CREATE TABLE IF NOT EXISTS node_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id   INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    event     TEXT    NOT NULL,
    timestamp INTEGER NOT NULL
);

-- ── 5. Torres físicas ──────────────────────────────────────────
-- Separa los campos PTP emisor/receptor a tabla dedicada
CREATE TABLE IF NOT EXISTS torres (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid       TEXT    UNIQUE NOT NULL,                    -- UUID generado por frontend
    nombre     TEXT    NOT NULL,
    ubicacion  TEXT    NOT NULL DEFAULT '',
    latitud    REAL    DEFAULT NULL,
    longitud   REAL    DEFAULT NULL,
    tramos     INTEGER NOT NULL DEFAULT 0,
    contacto   TEXT    NOT NULL DEFAULT '',
    pdf_path   TEXT    NOT NULL DEFAULT '',
    node_id    INTEGER DEFAULT NULL REFERENCES nodes(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── 6. Enlaces PTP (Point-to-Point) por torre ──────────────────
-- Normaliza ptp_emisor_* y ptp_receptor_* → 2 filas por torre
CREATE TABLE IF NOT EXISTS torre_ptp_endpoints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    torre_id    INTEGER NOT NULL REFERENCES torres(id) ON DELETE CASCADE,
    side        TEXT    NOT NULL CHECK(side IN ('emisor','receptor')),
    ip          TEXT    NOT NULL DEFAULT '',
    nombre      TEXT    NOT NULL DEFAULT '',
    modelo      TEXT    NOT NULL DEFAULT '',
    descripcion TEXT    NOT NULL DEFAULT '',
    UNIQUE(torre_id, side)
);

-- ── 7. Grupos de APs (ex ap_nodos) ─────────────────────────────
CREATE TABLE IF NOT EXISTS ap_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid        TEXT    UNIQUE NOT NULL,                   -- UUID generado por frontend
    nombre      TEXT    NOT NULL,
    descripcion TEXT    NOT NULL DEFAULT '',
    ubicacion   TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── 8. Access Points ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aps (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid                   TEXT    UNIQUE NOT NULL,         -- UUID generado por frontend
    ap_group_id            INTEGER NOT NULL REFERENCES ap_groups(id) ON DELETE CASCADE,
    hostname               TEXT    NOT NULL DEFAULT '',
    modelo                 TEXT    NOT NULL DEFAULT '',
    firmware               TEXT    NOT NULL DEFAULT '',
    mac_lan                TEXT    NOT NULL DEFAULT '',
    mac_wlan               TEXT    NOT NULL DEFAULT '',
    ip                     TEXT    NOT NULL,
    frecuencia_mhz         INTEGER DEFAULT NULL,           -- en MHz (antes era REAL en GHz)
    ssid                   TEXT    NOT NULL DEFAULT '',
    canal_mhz              INTEGER DEFAULT NULL,
    tx_power               INTEGER DEFAULT NULL,
    modo_red               TEXT    NOT NULL DEFAULT '',
    usuario_ssh            TEXT    NOT NULL DEFAULT 'ubnt',
    clave_ssh_enc          TEXT    DEFAULT NULL,            -- AES-256-GCM cifrada
    puerto_ssh             INTEGER NOT NULL DEFAULT 22,
    wifi_password_enc      TEXT    DEFAULT NULL,            -- AES-256-GCM cifrada
    router_port            INTEGER NOT NULL DEFAULT 8075,
    cpes_conectados_count  INTEGER NOT NULL DEFAULT 0,
    nombre_nodo            TEXT    NOT NULL DEFAULT '',     -- label del grupo (desnormalizado para display)
    is_active              INTEGER NOT NULL DEFAULT 1,     -- boolean 0/1
    last_seen              INTEGER NOT NULL DEFAULT 0,
    last_saved             INTEGER NOT NULL DEFAULT 0,
    created_at             INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at             INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── 9. CPEs conocidos (ex cpes_conocidos) ──────────────────────
CREATE TABLE IF NOT EXISTS cpes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    mac               TEXT    UNIQUE NOT NULL,              -- MAC principal del CPE
    ap_id             INTEGER DEFAULT NULL REFERENCES aps(id) ON DELETE SET NULL,
    hostname          TEXT    NOT NULL DEFAULT '',
    modelo            TEXT    NOT NULL DEFAULT '',
    firmware          TEXT    NOT NULL DEFAULT '',
    ip_lan            TEXT    NOT NULL DEFAULT '',
    mac_lan           TEXT    NOT NULL DEFAULT '',
    mac_wlan          TEXT    NOT NULL DEFAULT '',
    mac_ap            TEXT    NOT NULL DEFAULT '',          -- MAC del AP al que está conectado
    modo_red          TEXT    NOT NULL DEFAULT '',
    frecuencia_mhz    INTEGER DEFAULT NULL,
    canal_mhz         INTEGER DEFAULT NULL,
    tx_power          INTEGER DEFAULT NULL,
    ssid_ap           TEXT    NOT NULL DEFAULT '',
    remote_hostname   TEXT    NOT NULL DEFAULT '',
    remote_platform   TEXT    NOT NULL DEFAULT '',
    usuario_ssh       TEXT    NOT NULL DEFAULT '',
    clave_ssh_enc     TEXT    DEFAULT NULL,                 -- AES-256-GCM cifrada
    puerto_ssh        INTEGER NOT NULL DEFAULT 22,
    last_stats        TEXT    DEFAULT NULL,                 -- JSON snapshot del último poll SSH
    last_seen         INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at        INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── 10. Historial de señal RF ──────────────────────────────────
-- Renombrada: historial_senal → signal_history
-- FK a INTEGER ids en vez de TEXT (mac/uuid)
CREATE TABLE IF NOT EXISTS signal_history (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    cpe_id             INTEGER NOT NULL REFERENCES cpes(id) ON DELETE CASCADE,
    ap_id              INTEGER NOT NULL REFERENCES aps(id)  ON DELETE CASCADE,
    timestamp          INTEGER NOT NULL,
    signal_dbm         INTEGER DEFAULT NULL,
    remote_signal_dbm  INTEGER DEFAULT NULL,
    noisefloor_dbm     INTEGER DEFAULT NULL,
    cinr_db            REAL    DEFAULT NULL,
    ccq_pct            REAL    DEFAULT NULL,
    distancia_km       REAL    DEFAULT NULL,
    downlink_mbps      REAL    DEFAULT NULL,
    uplink_mbps        REAL    DEFAULT NULL,
    airtime_tx         REAL    DEFAULT NULL,
    airtime_rx         REAL    DEFAULT NULL
);

-- ── 11. Usuarios del sistema (RBAC) ────────────────────────────
CREATE TABLE IF NOT EXISTS vpn_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer'
                         CHECK(role IN ('admin','operator','viewer')),
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── 12. Configuración de la aplicación ─────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── 13. Colores de peers WireGuard ─────────────────────────────
CREATE TABLE IF NOT EXISTS peer_colors (
    peer_address TEXT PRIMARY KEY,
    color        TEXT NOT NULL
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ÍNDICES DE RENDIMIENTO                                     ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Nodes
CREATE INDEX IF NOT EXISTS idx_nodes_ppp_user     ON nodes(ppp_user);
CREATE INDEX IF NOT EXISTS idx_nodes_nombre_vrf   ON nodes(nombre_vrf);

-- Node SSH Creds
CREATE INDEX IF NOT EXISTS idx_node_ssh_node      ON node_ssh_creds(node_id);

-- Node Tags
CREATE INDEX IF NOT EXISTS idx_node_tags_node     ON node_tags(node_id);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag      ON node_tags(tag_id);

-- Node History
CREATE INDEX IF NOT EXISTS idx_node_hist_node     ON node_history(node_id);
CREATE INDEX IF NOT EXISTS idx_node_hist_ts       ON node_history(timestamp DESC);

-- Torres
CREATE INDEX IF NOT EXISTS idx_torres_node        ON torres(node_id);

-- Torre PTP
CREATE INDEX IF NOT EXISTS idx_ptp_torre          ON torre_ptp_endpoints(torre_id);

-- AP Groups (sin índice extra — pocos registros)

-- APs
CREATE INDEX IF NOT EXISTS idx_aps_group          ON aps(ap_group_id);
CREATE INDEX IF NOT EXISTS idx_aps_active         ON aps(is_active);
CREATE INDEX IF NOT EXISTS idx_aps_ip             ON aps(ip);

-- CPEs
CREATE INDEX IF NOT EXISTS idx_cpes_ap            ON cpes(ap_id);
CREATE INDEX IF NOT EXISTS idx_cpes_mac           ON cpes(mac);
CREATE INDEX IF NOT EXISTS idx_cpes_last_seen     ON cpes(last_seen DESC);

-- Signal History (la tabla más grande — optimizada para queries temporales)
CREATE INDEX IF NOT EXISTS idx_sig_cpe_ts         ON signal_history(cpe_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sig_ap_ts          ON signal_history(ap_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sig_ts             ON signal_history(timestamp DESC);

-- VPN Users
CREATE INDEX IF NOT EXISTS idx_vpn_users_username ON vpn_users(username);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  VISTAS ESTRATÉGICAS                                        ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Vista: Nodo completo con torre y tags ──────────────────────
-- Uso: GET /api/nodes → el backend consume esta vista directamente
CREATE VIEW IF NOT EXISTS v_node_full AS
SELECT
    n.id,
    n.ppp_user,
    n.mikrotik_id,
    n.nombre_nodo,
    n.nombre_vrf,
    n.iface_name,
    n.segmento_lan,
    n.ip_tunnel,
    n.label,
    n.server_ip,
    n.wg_public_key,
    n.created_at,
    n.updated_at,
    t.nombre     AS torre_nombre,
    t.ubicacion  AS torre_ubicacion,
    -- Tags concatenados (GROUP_CONCAT) para evitar N+1 en el backend
    (SELECT GROUP_CONCAT(tg.name, ',')
     FROM node_tags nt
     JOIN tags tg ON tg.id = nt.tag_id
     WHERE nt.node_id = n.id
    ) AS tags_csv
FROM nodes n
LEFT JOIN torres t ON t.node_id = n.id;

-- ── Vista: AP con su grupo y conteo real de CPEs ───────────────
-- Uso: GET /api/db/devices, Monitor AP
CREATE VIEW IF NOT EXISTS v_ap_summary AS
SELECT
    a.id,
    a.uuid,
    a.hostname,
    a.ip,
    a.modelo,
    a.firmware,
    a.ssid,
    a.frecuencia_mhz,
    a.canal_mhz,
    a.tx_power,
    a.modo_red,
    a.is_active,
    a.cpes_conectados_count,
    a.last_seen,
    a.last_saved,
    a.nombre_nodo,
    a.ap_group_id,
    g.uuid        AS grupo_uuid,
    g.nombre      AS grupo_nombre,
    (SELECT COUNT(*) FROM cpes c WHERE c.ap_id = a.id) AS cpes_registrados
FROM aps a
JOIN ap_groups g ON g.id = a.ap_group_id;

-- ── Vista: Último registro de señal por CPE ────────────────────
-- Uso: Dashboard de rendimiento, exportaciones, reportes
CREATE VIEW IF NOT EXISTS v_cpe_last_signal AS
SELECT
    c.id          AS cpe_id,
    c.mac,
    c.hostname,
    c.modelo,
    c.ip_lan,
    c.ap_id,
    a.hostname    AS ap_hostname,
    a.ip          AS ap_ip,
    a.uuid        AS ap_uuid,
    sh.signal_dbm,
    sh.remote_signal_dbm,
    sh.noisefloor_dbm,
    sh.ccq_pct,
    sh.cinr_db,
    sh.distancia_km,
    sh.downlink_mbps,
    sh.uplink_mbps,
    sh.airtime_tx,
    sh.airtime_rx,
    sh.timestamp  AS last_signal_at
FROM cpes c
LEFT JOIN aps a ON a.id = c.ap_id
LEFT JOIN signal_history sh ON sh.id = (
    SELECT sh2.id
    FROM signal_history sh2
    WHERE sh2.cpe_id = c.id
    ORDER BY sh2.timestamp DESC
    LIMIT 1
);

-- ── Vista: Torre completa con PTP y nodo asociado ──────────────
-- Uso: Topología de red, módulo de torres
CREATE VIEW IF NOT EXISTS v_torre_full AS
SELECT
    t.id,
    t.uuid,
    t.nombre,
    t.ubicacion,
    t.latitud,
    t.longitud,
    t.tramos,
    t.contacto,
    t.pdf_path,
    t.node_id,
    t.node_id    AS nodo_id,
    t.created_at,
    t.updated_at,
    n.nombre_nodo,
    n.nombre_vrf,
    n.ppp_user   AS nodo_ppp_user,
    -- PTP Emisor (LEFT JOIN → NULL si no existe)
    pe.ip          AS ptp_emisor_ip,
    pe.nombre      AS ptp_emisor_nombre,
    pe.modelo      AS ptp_emisor_modelo,
    pe.descripcion AS ptp_emisor_desc,
    -- PTP Receptor
    pr.ip          AS ptp_receptor_ip,
    pr.nombre      AS ptp_receptor_nombre,
    pr.modelo      AS ptp_receptor_modelo,
    pr.descripcion AS ptp_receptor_desc
FROM torres t
LEFT JOIN nodes n                ON n.id = t.node_id
LEFT JOIN torre_ptp_endpoints pe ON pe.torre_id = t.id AND pe.side = 'emisor'
LEFT JOIN torre_ptp_endpoints pr ON pr.torre_id = t.id AND pr.side = 'receptor';

-- ── Vista: Resumen de rendimiento por AP (últimas 24h) ─────────
-- Uso: Dashboard, alertas de degradación
CREATE VIEW IF NOT EXISTS v_ap_performance_24h AS
SELECT
    a.id          AS ap_id,
    a.uuid        AS ap_uuid,
    a.hostname    AS ap_hostname,
    a.ip          AS ap_ip,
    COUNT(sh.id)                    AS total_samples,
    COUNT(DISTINCT sh.cpe_id)       AS unique_cpes,
    ROUND(AVG(sh.signal_dbm), 1)    AS avg_signal,
    MIN(sh.signal_dbm)              AS worst_signal,
    MAX(sh.signal_dbm)              AS best_signal,
    ROUND(AVG(sh.ccq_pct), 1)      AS avg_ccq,
    ROUND(AVG(sh.downlink_mbps), 2) AS avg_downlink,
    ROUND(AVG(sh.uplink_mbps), 2)   AS avg_uplink
FROM aps a
LEFT JOIN signal_history sh ON sh.ap_id = a.id
    AND sh.timestamp > (strftime('%s','now') * 1000 - 86400000)
GROUP BY a.id;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║  TABLA DE MAPEO — Referencia para migración                 ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- OLD TABLE              → NEW TABLE              NOTAS
-- ─────────────────────────────────────────────────────────────
-- nodes (id=TEXT, data)   → nodes (id=INT)          JSON → columnas
-- node_labels             → nodes.label             merge 1:1
-- node_creds              → nodes.ppp_password_enc  merge 1:1
-- node_ssh_creds          → node_ssh_creds (norm)   JSON array → filas
-- node_tags (JSON)        → tags + node_tags (N:M)  bridge table
-- node_history            → node_history (FK INT)   ppp_user → node_id FK
-- devices (legacy)        → ELIMINADA               datos migrados a aps
-- ap_nodos                → ap_groups               renombrada
-- aps (id=TEXT)           → aps (id=INT, uuid)      nodo_id → ap_group_id FK
-- cpes_conocidos          → cpes                    mac PK → id INT + mac UNIQUE
-- historial_senal         → signal_history           cpe_mac → cpe_id FK
-- torres                  → torres + ptp_endpoints  PTP normalizado
-- vpn_users               → vpn_users               + updated_at, CHECK(role)
-- app_settings            → app_settings             + updated_at
-- peer_colors             → peer_colors              sin cambios
-- ─────────────────────────────────────────────────────────────
