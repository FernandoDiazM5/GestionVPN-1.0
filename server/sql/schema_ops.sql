-- ============================================================
--  MikroTik VPN Manager — Schema OPERATIVO (MySQL / MariaDB)
--  Portado desde schema_v2.sql (SQLite). Todo el dominio
--  operativo (nodos, SSH, torres, APs, CPEs, settings) vive
--  ahora en MySQL junto al dominio RBAC (schema_rbac.sql).
--
--  Notas de portabilidad SQLite → MySQL:
--    • INTEGER PK AUTOINCREMENT  → INT AUTO_INCREMENT PRIMARY KEY
--    • Columnas TEXT indexadas/UNIQUE/PK → VARCHAR(n)
--    • Timestamps (epoch ms)     → BIGINT
--    • REAL                      → DOUBLE
--    • Booleanos 0/1             → TINYINT
--    • CHECK(...) eliminados (validación en la app)
--    • Índices definidos INLINE (KEY) — sin CREATE INDEX externo
--    • FK con ON DELETE CASCADE / SET NULL (InnoDB)
-- ============================================================

-- ── 1. Nodos VPN ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nodes (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    ppp_user         VARCHAR(190) NOT NULL UNIQUE,
    mikrotik_id      VARCHAR(64)  NOT NULL DEFAULT '',
    nombre_nodo      VARCHAR(255) NOT NULL DEFAULT '',
    nombre_vrf       VARCHAR(190) NOT NULL DEFAULT '',
    iface_name       VARCHAR(190) NOT NULL DEFAULT '',
    segmento_lan     VARCHAR(190) NOT NULL DEFAULT '',
    ip_tunnel        VARCHAR(64)  NOT NULL DEFAULT '',
    ppp_password_enc TEXT         DEFAULT NULL,
    label            VARCHAR(255) NOT NULL DEFAULT '',
    server_ip        VARCHAR(64)  NOT NULL DEFAULT '',
    wg_public_key    VARCHAR(255) NOT NULL DEFAULT '',
    lan_subnets      VARCHAR(2000) NOT NULL DEFAULT '[]',
    protocol         VARCHAR(20)  NOT NULL DEFAULT 'sstp',
    node_number      INT          DEFAULT NULL,
    workspace_id     CHAR(36)     DEFAULT NULL,           -- inquilino dueño del nodo (multi-tenant)
    created_at       BIGINT       NOT NULL DEFAULT 0,
    updated_at       BIGINT       NOT NULL DEFAULT 0,
    KEY idx_nodes_nombre_vrf (nombre_vrf),
    KEY idx_nodes_workspace (workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Credenciales SSH por nodo ───────────────────────────
CREATE TABLE IF NOT EXISTS node_ssh_creds (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    node_id      INT NOT NULL,
    ssh_user     VARCHAR(190) NOT NULL DEFAULT 'ubnt',
    ssh_pass_enc TEXT         DEFAULT NULL,
    ssh_port     INT NOT NULL DEFAULT 22,
    priority     INT NOT NULL DEFAULT 0,
    created_at   BIGINT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_ssh_node_prio (node_id, priority),
    KEY idx_node_ssh_node (node_id),
    CONSTRAINT fk_ssh_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Tags (N:M) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(190) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS node_tags (
    node_id INT NOT NULL,
    tag_id  INT NOT NULL,
    PRIMARY KEY (node_id, tag_id),
    KEY idx_node_tags_tag (tag_id),
    CONSTRAINT fk_nt_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    CONSTRAINT fk_nt_tag  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. Historial de eventos de nodos ───────────────────────
CREATE TABLE IF NOT EXISTS node_history (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    node_id   INT NOT NULL,
    event     VARCHAR(255) NOT NULL,
    timestamp BIGINT NOT NULL,
    KEY idx_node_hist_node (node_id),
    KEY idx_node_hist_ts (timestamp),
    CONSTRAINT fk_hist_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. Torres físicas ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS torres (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    uuid       VARCHAR(64)  NOT NULL UNIQUE,
    nombre     VARCHAR(255) NOT NULL,
    ubicacion  VARCHAR(255) NOT NULL DEFAULT '',
    latitud    DOUBLE       DEFAULT NULL,
    longitud   DOUBLE       DEFAULT NULL,
    tramos     INT NOT NULL DEFAULT 0,
    contacto   VARCHAR(255) NOT NULL DEFAULT '',
    pdf_path   VARCHAR(512) NOT NULL DEFAULT '',
    node_id    INT          DEFAULT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    KEY idx_torres_node (node_id),
    CONSTRAINT fk_torre_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. Enlaces PTP por torre ───────────────────────────────
CREATE TABLE IF NOT EXISTS torre_ptp_endpoints (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    torre_id    INT NOT NULL,
    side        VARCHAR(16)  NOT NULL,
    ip          VARCHAR(64)  NOT NULL DEFAULT '',
    nombre      VARCHAR(255) NOT NULL DEFAULT '',
    modelo      VARCHAR(255) NOT NULL DEFAULT '',
    descripcion VARCHAR(512) NOT NULL DEFAULT '',
    UNIQUE KEY uq_ptp_torre_side (torre_id, side),
    CONSTRAINT fk_ptp_torre FOREIGN KEY (torre_id) REFERENCES torres(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 7. Grupos de APs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_groups (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    uuid         VARCHAR(64)  NOT NULL UNIQUE,
    nombre       VARCHAR(255) NOT NULL,
    descripcion  VARCHAR(512) NOT NULL DEFAULT '',
    ubicacion    VARCHAR(255) NOT NULL DEFAULT '',
    workspace_id CHAR(36)     DEFAULT NULL,           -- inquilino dueño (multi-tenant)
    created_at   BIGINT NOT NULL DEFAULT 0,
    updated_at   BIGINT NOT NULL DEFAULT 0,
    KEY idx_ap_groups_workspace (workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 8. Access Points ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS aps (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    uuid                  VARCHAR(64)  NOT NULL UNIQUE,
    ap_group_id           INT NOT NULL,
    hostname              VARCHAR(255) NOT NULL DEFAULT '',
    modelo                VARCHAR(255) NOT NULL DEFAULT '',
    firmware              VARCHAR(255) NOT NULL DEFAULT '',
    mac_lan               VARCHAR(32)  NOT NULL DEFAULT '',
    mac_wlan              VARCHAR(32)  NOT NULL DEFAULT '',
    ip                    VARCHAR(64)  NOT NULL,
    frecuencia_mhz        INT          DEFAULT NULL,
    ssid                  VARCHAR(255) NOT NULL DEFAULT '',
    canal_mhz             INT          DEFAULT NULL,
    tx_power              INT          DEFAULT NULL,
    modo_red              VARCHAR(64)  NOT NULL DEFAULT '',
    usuario_ssh           VARCHAR(190) NOT NULL DEFAULT 'ubnt',
    clave_ssh_enc         TEXT         DEFAULT NULL,
    puerto_ssh            INT NOT NULL DEFAULT 22,
    wifi_password_enc     TEXT         DEFAULT NULL,
    router_port           INT NOT NULL DEFAULT 8075,
    cpes_conectados_count INT NOT NULL DEFAULT 0,
    nombre_nodo           VARCHAR(255) NOT NULL DEFAULT '',
    is_active             TINYINT NOT NULL DEFAULT 1,
    last_seen             BIGINT NOT NULL DEFAULT 0,
    last_saved            BIGINT NOT NULL DEFAULT 0,
    created_at            BIGINT NOT NULL DEFAULT 0,
    updated_at            BIGINT NOT NULL DEFAULT 0,
    KEY idx_aps_group (ap_group_id),
    KEY idx_aps_active (is_active),
    KEY idx_aps_ip (ip),
    CONSTRAINT fk_ap_group FOREIGN KEY (ap_group_id) REFERENCES ap_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 9. CPEs conocidos ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    mac             VARCHAR(32) NOT NULL UNIQUE,
    ap_id           INT          DEFAULT NULL,
    hostname        VARCHAR(255) NOT NULL DEFAULT '',
    modelo          VARCHAR(255) NOT NULL DEFAULT '',
    firmware        VARCHAR(255) NOT NULL DEFAULT '',
    ip_lan          VARCHAR(64)  NOT NULL DEFAULT '',
    mac_lan         VARCHAR(32)  NOT NULL DEFAULT '',
    mac_wlan        VARCHAR(32)  NOT NULL DEFAULT '',
    mac_ap          VARCHAR(32)  NOT NULL DEFAULT '',
    modo_red        VARCHAR(64)  NOT NULL DEFAULT '',
    frecuencia_mhz  INT          DEFAULT NULL,
    canal_mhz       INT          DEFAULT NULL,
    tx_power        INT          DEFAULT NULL,
    ssid_ap         VARCHAR(255) NOT NULL DEFAULT '',
    remote_hostname VARCHAR(255) NOT NULL DEFAULT '',
    remote_platform VARCHAR(255) NOT NULL DEFAULT '',
    usuario_ssh     VARCHAR(190) NOT NULL DEFAULT '',
    clave_ssh_enc   TEXT         DEFAULT NULL,
    puerto_ssh      INT NOT NULL DEFAULT 22,
    last_stats      TEXT         DEFAULT NULL,
    last_seen       BIGINT NOT NULL DEFAULT 0,
    created_at      BIGINT NOT NULL DEFAULT 0,
    updated_at      BIGINT NOT NULL DEFAULT 0,
    KEY idx_cpes_ap (ap_id),
    KEY idx_cpes_last_seen (last_seen),
    CONSTRAINT fk_cpe_ap FOREIGN KEY (ap_id) REFERENCES aps(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 10. Historial de señal RF ──────────────────────────────
CREATE TABLE IF NOT EXISTS signal_history (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    cpe_id            INT NOT NULL,
    ap_id             INT NOT NULL,
    timestamp         BIGINT NOT NULL,
    signal_dbm        INT    DEFAULT NULL,
    remote_signal_dbm INT    DEFAULT NULL,
    noisefloor_dbm    INT    DEFAULT NULL,
    cinr_db           DOUBLE DEFAULT NULL,
    ccq_pct           DOUBLE DEFAULT NULL,
    distancia_km      DOUBLE DEFAULT NULL,
    downlink_mbps     DOUBLE DEFAULT NULL,
    uplink_mbps       DOUBLE DEFAULT NULL,
    airtime_tx        DOUBLE DEFAULT NULL,
    airtime_rx        DOUBLE DEFAULT NULL,
    KEY idx_sig_cpe_ts (cpe_id, timestamp),
    KEY idx_sig_ap_ts (ap_id, timestamp),
    KEY idx_sig_ts (timestamp),
    CONSTRAINT fk_sig_cpe FOREIGN KEY (cpe_id) REFERENCES cpes(id) ON DELETE CASCADE,
    CONSTRAINT fk_sig_ap  FOREIGN KEY (ap_id)  REFERENCES aps(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 11. Usuarios legacy (bootstrap admin SQLite → MySQL) ───
CREATE TABLE IF NOT EXISTS vpn_users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'viewer',
    created_at    BIGINT NOT NULL DEFAULT 0,
    updated_at    BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 12. Configuración de la aplicación ─────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
    `key`      VARCHAR(190) NOT NULL PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 13. Colores de peers WireGuard ─────────────────────────
CREATE TABLE IF NOT EXISTS peer_colors (
    peer_address VARCHAR(190) NOT NULL PRIMARY KEY,
    color        VARCHAR(32)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 14. Dueño (workspace) de cada peer WG de gestión (Usuarios) ─────
-- Los peers viven en el router (VPN-WG-MGMT); esta tabla los atribuye a
-- un moderador para aislar la vista "Usuarios" por workspace.
CREATE TABLE IF NOT EXISTS mgmt_peer_owners (
    public_key      VARCHAR(255) NOT NULL PRIMARY KEY,
    workspace_id    CHAR(36)     DEFAULT NULL,
    allowed_address VARCHAR(64)  NOT NULL DEFAULT '',
    comment         VARCHAR(255) NOT NULL DEFAULT '',
    created_at      BIGINT       NOT NULL DEFAULT 0,
    KEY idx_mgmt_peer_ws (workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  VISTAS                                                   ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW v_node_full AS
SELECT
    n.id, n.ppp_user, n.mikrotik_id, n.nombre_nodo, n.nombre_vrf,
    n.iface_name, n.segmento_lan, n.ip_tunnel, n.label, n.server_ip,
    n.wg_public_key, n.created_at, n.updated_at,
    t.nombre    AS torre_nombre,
    t.ubicacion AS torre_ubicacion,
    (SELECT GROUP_CONCAT(tg.name SEPARATOR ',')
       FROM node_tags nt JOIN tags tg ON tg.id = nt.tag_id
      WHERE nt.node_id = n.id) AS tags_csv
FROM nodes n
LEFT JOIN torres t ON t.node_id = n.id;

CREATE OR REPLACE VIEW v_ap_summary AS
SELECT
    a.id, a.uuid, a.hostname, a.ip, a.modelo, a.firmware, a.ssid,
    a.frecuencia_mhz, a.canal_mhz, a.tx_power, a.modo_red, a.is_active,
    a.cpes_conectados_count, a.last_seen, a.last_saved, a.nombre_nodo,
    a.ap_group_id,
    g.uuid   AS grupo_uuid,
    g.nombre AS grupo_nombre,
    (SELECT COUNT(*) FROM cpes c WHERE c.ap_id = a.id) AS cpes_registrados
FROM aps a
JOIN ap_groups g ON g.id = a.ap_group_id;

CREATE OR REPLACE VIEW v_cpe_last_signal AS
SELECT
    c.id AS cpe_id, c.mac, c.hostname, c.modelo, c.ip_lan, c.ap_id,
    a.hostname AS ap_hostname, a.ip AS ap_ip, a.uuid AS ap_uuid,
    sh.signal_dbm, sh.remote_signal_dbm, sh.noisefloor_dbm, sh.ccq_pct,
    sh.cinr_db, sh.distancia_km, sh.downlink_mbps, sh.uplink_mbps,
    sh.airtime_tx, sh.airtime_rx, sh.timestamp AS last_signal_at
FROM cpes c
LEFT JOIN aps a ON a.id = c.ap_id
LEFT JOIN signal_history sh ON sh.id = (
    SELECT sh2.id FROM signal_history sh2
     WHERE sh2.cpe_id = c.id ORDER BY sh2.timestamp DESC LIMIT 1
);

CREATE OR REPLACE VIEW v_torre_full AS
SELECT
    t.id, t.uuid, t.nombre, t.ubicacion, t.latitud, t.longitud,
    t.tramos, t.contacto, t.pdf_path, t.node_id,
    t.node_id AS nodo_id, t.created_at, t.updated_at,
    n.nombre_nodo, n.nombre_vrf, n.ppp_user AS nodo_ppp_user,
    pe.ip AS ptp_emisor_ip, pe.nombre AS ptp_emisor_nombre,
    pe.modelo AS ptp_emisor_modelo, pe.descripcion AS ptp_emisor_desc,
    pr.ip AS ptp_receptor_ip, pr.nombre AS ptp_receptor_nombre,
    pr.modelo AS ptp_receptor_modelo, pr.descripcion AS ptp_receptor_desc
FROM torres t
LEFT JOIN nodes n ON n.id = t.node_id
LEFT JOIN torre_ptp_endpoints pe ON pe.torre_id = t.id AND pe.side = 'emisor'
LEFT JOIN torre_ptp_endpoints pr ON pr.torre_id = t.id AND pr.side = 'receptor';

CREATE OR REPLACE VIEW v_ap_performance_24h AS
SELECT
    a.id AS ap_id, a.uuid AS ap_uuid, a.hostname AS ap_hostname, a.ip AS ap_ip,
    COUNT(sh.id) AS total_samples,
    COUNT(DISTINCT sh.cpe_id) AS unique_cpes,
    ROUND(AVG(sh.signal_dbm), 1) AS avg_signal,
    MIN(sh.signal_dbm) AS worst_signal,
    MAX(sh.signal_dbm) AS best_signal,
    ROUND(AVG(sh.ccq_pct), 1) AS avg_ccq,
    ROUND(AVG(sh.downlink_mbps), 2) AS avg_downlink,
    ROUND(AVG(sh.uplink_mbps), 2) AS avg_uplink
FROM aps a
LEFT JOIN signal_history sh ON sh.ap_id = a.id
    AND sh.timestamp > (UNIX_TIMESTAMP() * 1000 - 86400000)
GROUP BY a.id;
