-- ============================================================
--  Esquema Multi-usuario — Aislamiento de túneles por usuario
--  (mangle por IP de gestión · 1 túnel activo por usuario)
--
--  Aditivo: NO toca tablas existentes. Aplicar con:
--     cd server && npm run init:multiuser
--
--  Principios:
--   • InnoDB + FKs · BIGINT epoch-ms (Date.now()) seteado en código
--   • "1 ACTIVE por usuario" se garantiza en código (transacción)
--   • Los logs son APPEND-ONLY (sin FK a session para sobrevivir borrados)
--   • La IP de gestión SIEMPRE se resuelve server-side (anti-spoofing)
-- ============================================================

SET NAMES utf8mb4;

-- ── 1. Mapeo usuario de la app → su IP de gestión (10.13.250.x / 10.14.250.x) ──
--  Fuente de verdad para el src-address de la mangle. NUNCA se confía
--  en la IP que envía el cliente.
CREATE TABLE IF NOT EXISTS user_mgmt_ips (
  id            CHAR(36)     NOT NULL,
  workspace_id  CHAR(36)     NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  mgmt_ip       VARCHAR(64)  NOT NULL,                 -- 10.13.250.x / 10.14.250.x (sin /32)
  public_key    VARCHAR(120) DEFAULT NULL,             -- peer WG asociado (si aplica)
  source        ENUM('member_wg','mgmt_peer','manual','auto-provision','auto-heal') NOT NULL DEFAULT 'manual',
  created_at    BIGINT       NOT NULL,
  updated_at    BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_umi_user (workspace_id, user_id),       -- 1 IP por usuario
  UNIQUE KEY uq_umi_ip (mgmt_ip),                       -- 1 usuario por IP (sin colisión)
  KEY idx_umi_user (user_id),
  CONSTRAINT fk_umi_ws   FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_umi_user FOREIGN KEY (user_id)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Sesiones de túnel por usuario ──
--  status: ACTIVE (vigente) · CLOSED (cerrada/desactivada).
--  "1 ACTIVE por usuario" se fuerza en sessionRepo.activate() (transacción:
--  cierra la previa antes de abrir la nueva).
CREATE TABLE IF NOT EXISTS tunnel_user_sessions (
  id                CHAR(36)     NOT NULL,
  workspace_id      CHAR(36)     NOT NULL,
  user_id           CHAR(36)     NOT NULL,
  tunnel_id         VARCHAR(160) NOT NULL,             -- ppp_user / nombre_vrf (textual)
  vrf_name          VARCHAR(160) NOT NULL,
  mgmt_ip           VARCHAR(64)  NOT NULL,             -- IP usada en la mangle (copia auditable)
  status            ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  mangle_id         VARCHAR(64)  DEFAULT NULL,         -- .id de la regla mangle (cleanup preciso)
  firewall_rule_ids TEXT         DEFAULT NULL,         -- JSON [.id,...] (Fase 5 opcional)
  activated_at      BIGINT       NOT NULL,
  expires_at        BIGINT       DEFAULT NULL,         -- activated_at + TTL (30 min)
  deactivated_at    BIGINT       DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tus_user (user_id),
  KEY idx_tus_tunnel (tunnel_id),
  KEY idx_tus_status (status),
  KEY idx_tus_ws_status (workspace_id, status),
  CONSTRAINT fk_tus_ws   FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_tus_user FOREIGN KEY (user_id)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Auditoría append-only de sesiones ──
--  Sin FK a session_id: el log sobrevive aunque la sesión se borre.
CREATE TABLE IF NOT EXISTS tunnel_session_logs (
  id            CHAR(36)     NOT NULL,
  workspace_id  CHAR(36)     NOT NULL,
  session_id    CHAR(36)     DEFAULT NULL,
  user_id       CHAR(36)     NOT NULL,
  tunnel_id     VARCHAR(160) NOT NULL,
  action        VARCHAR(40)  NOT NULL,                 -- ACTIVATE | DEACTIVATE | SWITCH | EXPIRE | ERROR
  mgmt_ip       VARCHAR(64)  DEFAULT NULL,
  status_code   INT          DEFAULT 200,
  message       TEXT         DEFAULT NULL,
  ip_address    VARCHAR(64)  DEFAULT NULL,             -- IP del cliente HTTP (forense)
  created_at    BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tsl_user (user_id),
  KEY idx_tsl_tunnel (tunnel_id),
  KEY idx_tsl_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
