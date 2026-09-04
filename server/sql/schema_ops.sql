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
    wg_cpe_public    VARCHAR(255) NOT NULL DEFAULT '',   -- clave pública del CPE (peer en el Core)
    wg_cpe_private_enc TEXT        DEFAULT NULL,          -- clave privada del CPE (AES-256-GCM) para reembeber en el script
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
    CONSTRAINT fk_torre_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
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
    node_id               INT          DEFAULT NULL,        -- nodo VPN dueño (Fase 2-B; resuelto por nombre_nodo/subred)
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
    KEY idx_aps_node (node_id),
    CONSTRAINT fk_ap_group FOREIGN KEY (ap_group_id) REFERENCES ap_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_ap_node  FOREIGN KEY (node_id)      REFERENCES nodes(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 9. CPEs conocidos ──────────────────────────────────────
-- Último estado operativo resumido de cada AP. Se conserva aunque el túnel
-- esté inactivo; el diagnóstico técnico completo nunca se persiste aquí.
CREATE TABLE IF NOT EXISTS ap_status_snapshots (
    ap_id          INT PRIMARY KEY,
    signal_dbm     SMALLINT      DEFAULT NULL,
    ccq_pct        DECIMAL(5,2)  DEFAULT NULL,
    tx_power_dbm   SMALLINT      DEFAULT NULL,
    uptime_text    VARCHAR(64)   DEFAULT NULL,
    cpu_pct        DECIMAL(5,2)  DEFAULT NULL,
    captured_at    BIGINT NOT NULL,
    KEY idx_ap_status_captured (captured_at),
    CONSTRAINT fk_ap_status_ap FOREIGN KEY (ap_id) REFERENCES aps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
    CONSTRAINT fk_cpe_ap FOREIGN KEY (ap_id) REFERENCES aps(id) ON DELETE CASCADE
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

-- ── 12b. Ejecuciones del respaldo dual del core ─────────────
-- Sólo metadatos: los archivos .backup/.rsc NUNCA se persisten en MySQL.
CREATE TABLE IF NOT EXISTS core_backup_runs (
    id                CHAR(36) NOT NULL PRIMARY KEY,
    dedupe_key        VARCHAR(190) NOT NULL,
    trigger_type      ENUM('scheduled','manual') NOT NULL,
    local_date        CHAR(10) NOT NULL,
    status            ENUM('RUNNING','SENT','FAILED') NOT NULL,
    identity_name     VARCHAR(190) DEFAULT NULL,
    backup_size_bytes BIGINT DEFAULT NULL,
    backup_sha256     CHAR(64) DEFAULT NULL,
    rsc_size_bytes    BIGINT DEFAULT NULL,
    rsc_sha256        CHAR(64) DEFAULT NULL,
    recipient_masked  VARCHAR(255) DEFAULT NULL,
    failure_code      VARCHAR(80) DEFAULT NULL,
    started_at        BIGINT NOT NULL,
    sent_at           BIGINT DEFAULT NULL,
    finished_at       BIGINT DEFAULT NULL,
    UNIQUE KEY uq_core_backup_dedupe (dedupe_key),
    KEY idx_core_backup_started (started_at),
    KEY idx_core_backup_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE notification_subscriptions
  ADD COLUMN IF NOT EXISTS telegram_bot_fingerprint CHAR(64) DEFAULT NULL AFTER telegram_chat_id;

ALTER TABLE tunnel_user_sessions
  ADD COLUMN IF NOT EXISTS lease_source VARCHAR(20) NOT NULL DEFAULT 'WEB' AFTER expires_at,
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at BIGINT DEFAULT NULL AFTER lease_source;

-- El producto desplegado opera exclusivamente desde el VPS. Normaliza también
-- instalaciones antiguas que conservaran el selector local.
INSERT INTO app_settings (`key`, value, updated_at) VALUES ('scan_mode', 'vps', 0)
ON DUPLICATE KEY UPDATE value = 'vps';

-- ── 12c. Trazabilidad del asistente de Servidor VPN ─────────
-- Nunca almacena contraseñas, claves privadas ni la configuración exportada.
CREATE TABLE IF NOT EXISTS core_provision_runs (
    id                CHAR(36) NOT NULL PRIMARY KEY,
    operation_type    ENUM('PREPARE_NEW') NOT NULL,
    status            ENUM('RUNNING','COMPLETED','FAILED','BLOCKED') NOT NULL,
    actor_user_id     CHAR(36) DEFAULT NULL,
    target_host       VARCHAR(255) DEFAULT NULL,
    target_identity   VARCHAR(190) DEFAULT NULL,
    target_version    VARCHAR(80) DEFAULT NULL,
    target_model      VARCHAR(120) DEFAULT NULL,
    network_supernet  VARCHAR(64) DEFAULT NULL,
    steps_json        LONGTEXT DEFAULT NULL,
    error_code        VARCHAR(80) DEFAULT NULL,
    error_message     VARCHAR(500) DEFAULT NULL,
    started_at        BIGINT NOT NULL,
    finished_at       BIGINT DEFAULT NULL,
    KEY idx_core_provision_started (started_at),
    KEY idx_core_provision_status (status),
    CONSTRAINT fk_core_provision_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 13. Colores de peers WireGuard ─────────────────────────
CREATE TABLE IF NOT EXISTS peer_colors (
    peer_address VARCHAR(190) NOT NULL PRIMARY KEY,
    color        VARCHAR(32)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 13b. Alias humano de cada peer WG (Usuarios VPN) ─────────────
-- El "Usuario" del peer es el comment de RouterOS y se preserva inmutable
-- (cambiarlo rompe la trazabilidad MikroTik). El alias vive solo en la
-- BD del panel y permite al moderador anotar "PC casa", "Celular personal",
-- etc. Aislado por workspace para defensa en profundidad.
CREATE TABLE IF NOT EXISTS peer_aliases (
    workspace_id  CHAR(36)     NOT NULL,
    peer_address  VARCHAR(64)  NOT NULL,
    alias         VARCHAR(120) NOT NULL,
    updated_at    BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, peer_address)
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
CREATE TABLE IF NOT EXISTS workspace_integrations (
  workspace_id CHAR(36) NOT NULL,
  provider VARCHAR(24) NOT NULL,
  config_enc TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  active TINYINT(1) NOT NULL DEFAULT 1,
  display_label VARCHAR(255) DEFAULT NULL,
  metadata_json TEXT DEFAULT NULL,
  last_validated_at BIGINT NOT NULL,
  last_error_code VARCHAR(64) DEFAULT NULL,
  configured_by CHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, provider),
  KEY idx_workspace_integrations_active (workspace_id, active),
  CONSTRAINT fk_workspace_integrations_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_integrations_user FOREIGN KEY (configured_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_integrations (
  provider VARCHAR(24) NOT NULL PRIMARY KEY,
  config_enc TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  active TINYINT(1) NOT NULL DEFAULT 1,
  display_label VARCHAR(255) DEFAULT NULL,
  metadata_json TEXT DEFAULT NULL,
  last_validated_at BIGINT NOT NULL,
  last_error_code VARCHAR(64) DEFAULT NULL,
  configured_by CHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  KEY idx_platform_integrations_active (active),
  CONSTRAINT fk_platform_integrations_user FOREIGN KEY (configured_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_catalog_entries (
  workspace_id CHAR(36) NOT NULL,
  catalog_type VARCHAR(48) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  metadata_json TEXT DEFAULT NULL,
  last_synced_at BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, catalog_type, external_id),
  KEY idx_external_catalog_type (workspace_id, catalog_type, display_name),
  CONSTRAINT fk_external_catalog_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_catalog_sync_state (
  workspace_id CHAR(36) NOT NULL,
  catalog_type VARCHAR(48) NOT NULL,
  entry_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_synced_at BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, catalog_type),
  CONSTRAINT fk_external_catalog_state_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_guides (
  integration_key VARCHAR(48) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  version_label VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(768) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  configured_by CHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_integration_guide_user FOREIGN KEY (configured_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_forum_groups (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  telegram_chat_id VARCHAR(32) DEFAULT NULL,
  display_name VARCHAR(255) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING_LINK',
  missing_permissions_json TEXT DEFAULT NULL,
  link_code_hash CHAR(64) DEFAULT NULL,
  link_code_expires_at BIGINT DEFAULT NULL,
  linked_by CHAR(36) NOT NULL,
  linked_at BIGINT DEFAULT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_telegram_forum_chat (telegram_chat_id),
  KEY idx_telegram_forum_workspace (workspace_id,status),
  CONSTRAINT fk_telegram_forum_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_forum_user FOREIGN KEY (linked_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_forum_topics (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  client_external_id VARCHAR(128) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  topic_name VARCHAR(128) NOT NULL,
  telegram_thread_id VARCHAR(32) DEFAULT NULL,
  status VARCHAR(24) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_telegram_topic_client (group_id,client_external_id),
  KEY idx_telegram_topic_workspace (workspace_id,group_id,status),
  CONSTRAINT fk_telegram_topic_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_topic_group FOREIGN KEY (group_id) REFERENCES telegram_forum_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_topic_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_forum_participants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  telegram_user_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL,
  invite_link VARCHAR(512) DEFAULT NULL,
  invite_expires_at BIGINT DEFAULT NULL,
  acted_by CHAR(36) NOT NULL,
  joined_at BIGINT DEFAULT NULL,
  removed_at BIGINT DEFAULT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_telegram_forum_participant_user (group_id,user_id),
  UNIQUE KEY uq_telegram_forum_participant_telegram (group_id,telegram_user_id),
  KEY idx_telegram_forum_participants (workspace_id,group_id,status),
  CONSTRAINT fk_telegram_participant_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_participant_group FOREIGN KEY (group_id) REFERENCES telegram_forum_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_participant_actor FOREIGN KEY (acted_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_forum_audit (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  action VARCHAR(48) NOT NULL,
  entity_type VARCHAR(24) NOT NULL,
  entity_id CHAR(36) DEFAULT NULL,
  result VARCHAR(24) NOT NULL,
  detail VARCHAR(512) DEFAULT NULL,
  created_at BIGINT NOT NULL,
  KEY idx_telegram_forum_audit (workspace_id,created_at),
  CONSTRAINT fk_telegram_forum_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_forum_audit_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_group_profiles (
  group_id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  profile_type VARCHAR(24) NOT NULL DEFAULT 'CLIENT_TRACKING',
  capabilities_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  KEY idx_telegram_group_profile_workspace (workspace_id,profile_type),
  CONSTRAINT fk_telegram_group_profile_group FOREIGN KEY (group_id) REFERENCES telegram_forum_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_group_profile_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_topic_bulk_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  status VARCHAR(24) NOT NULL,
  total_clients INT NOT NULL DEFAULT 0,
  existing_count INT NOT NULL DEFAULT 0,
  pending_count INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  requested_by CHAR(36) NOT NULL,
  retry_at BIGINT DEFAULT NULL,
  started_at BIGINT DEFAULT NULL,
  finished_at BIGINT DEFAULT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  KEY idx_telegram_bulk_workspace (workspace_id,group_id,status),
  CONSTRAINT fk_telegram_bulk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_bulk_group FOREIGN KEY (group_id) REFERENCES telegram_forum_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_bulk_user FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_topic_bulk_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  client_external_id VARCHAR(128) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL,
  topic_id CHAR(36) DEFAULT NULL,
  error_code VARCHAR(64) DEFAULT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_telegram_bulk_client (job_id,client_external_id),
  KEY idx_telegram_bulk_items (job_id,status),
  CONSTRAINT fk_telegram_bulk_item_job FOREIGN KEY (job_id) REFERENCES telegram_topic_bulk_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_bulk_item_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_bulk_item_group FOREIGN KEY (group_id) REFERENCES telegram_forum_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_telegram_bulk_item_topic FOREIGN KEY (topic_id) REFERENCES telegram_forum_topics(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_routes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  topic_id CHAR(36) DEFAULT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  zone VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  responsible_user_id CHAR(36) NOT NULL,
  cable_type VARCHAR(64) DEFAULT NULL,
  cable_capacity INT DEFAULT NULL,
  origin_coordinates VARCHAR(128) DEFAULT NULL,
  destination_coordinates VARCHAR(128) DEFAULT NULL,
  created_by CHAR(36) NOT NULL,
  closed_at BIGINT DEFAULT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_fiber_route_code (workspace_id,code),
  KEY idx_fiber_route_group (workspace_id,group_id,status),
  CONSTRAINT fk_fiber_route_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_route_group FOREIGN KEY (group_id) REFERENCES telegram_forum_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_route_topic FOREIGN KEY (topic_id) REFERENCES telegram_forum_topics(id) ON DELETE SET NULL,
  CONSTRAINT fk_fiber_route_responsible FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fiber_route_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_route_elements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  route_id CHAR(36) NOT NULL,
  sequence_no INT NOT NULL,
  element_type VARCHAR(24) NOT NULL,
  name VARCHAR(128) NOT NULL,
  location VARCHAR(255) DEFAULT NULL,
  coordinates VARCHAR(128) DEFAULT NULL,
  tray VARCHAR(64) DEFAULT NULL,
  port VARCHAR(64) DEFAULT NULL,
  input_cable VARCHAR(128) DEFAULT NULL,
  input_fiber VARCHAR(64) DEFAULT NULL,
  output_cable VARCHAR(128) DEFAULT NULL,
  output_fiber VARCHAR(64) DEFAULT NULL,
  fusion_type VARCHAR(64) DEFAULT NULL,
  splitter_ratio VARCHAR(32) DEFAULT NULL,
  reserve_length VARCHAR(32) DEFAULT NULL,
  notes VARCHAR(512) DEFAULT NULL,
  created_by CHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uq_fiber_route_sequence (route_id,sequence_no),
  KEY idx_fiber_route_elements (workspace_id,route_id),
  CONSTRAINT fk_fiber_element_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_element_route FOREIGN KEY (route_id) REFERENCES fiber_routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_element_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_route_measurements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  route_id CHAR(36) NOT NULL,
  element_id CHAR(36) DEFAULT NULL,
  power_dbm DECIMAL(8,2) NOT NULL,
  wavelength_nm INT DEFAULT NULL,
  notes VARCHAR(512) DEFAULT NULL,
  measured_by CHAR(36) NOT NULL,
  measured_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  KEY idx_fiber_measurements (workspace_id,route_id,measured_at),
  CONSTRAINT fk_fiber_measure_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_measure_route FOREIGN KEY (route_id) REFERENCES fiber_routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_measure_element FOREIGN KEY (element_id) REFERENCES fiber_route_elements(id) ON DELETE SET NULL,
  CONSTRAINT fk_fiber_measure_user FOREIGN KEY (measured_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_route_evidence (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  route_id CHAR(36) NOT NULL,
  element_id CHAR(36) DEFAULT NULL,
  telegram_file_id VARCHAR(255) DEFAULT NULL,
  evidence_type VARCHAR(24) NOT NULL DEFAULT 'NOTE',
  description VARCHAR(512) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  KEY idx_fiber_evidence (workspace_id,route_id,created_at),
  CONSTRAINT fk_fiber_evidence_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_evidence_route FOREIGN KEY (route_id) REFERENCES fiber_routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_evidence_element FOREIGN KEY (element_id) REFERENCES fiber_route_elements(id) ON DELETE SET NULL,
  CONSTRAINT fk_fiber_evidence_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiber_route_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  route_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  detail VARCHAR(512) DEFAULT NULL,
  created_at BIGINT NOT NULL,
  KEY idx_fiber_route_events (workspace_id,route_id,created_at),
  CONSTRAINT fk_fiber_event_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_event_route FOREIGN KEY (route_id) REFERENCES fiber_routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiber_event_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
