-- ============================================================
--  MikroTik VPN Manager — Esquema Multi-Usuario / RBAC (MySQL)
--  Fase 1: Multitenancy lógico + Soft Deletes + Auditoría
--
--  Principios de ingeniería:
--   • InnoDB (transacciones ACID + FKs)
--   • UUID (CHAR 36) como PK de API; índices para FKs
--   • Soft deletes (deleted_at) en entidades de negocio
--   • tunnel_logs es APPEND-ONLY y usa tunnel_id TEXTUAL
--     (sobrevive al borrado lógico de un túnel → auditoría intacta)
--   • Credenciales de router SIEMPRE cifradas (password_enc)
--   • utf8mb4 para soporte completo de Unicode
--
--  Ejecutar con:  npm run init:rbac   (ver server/db/initRbac.js)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ── 1. Usuarios ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36)      NOT NULL,
  email           VARCHAR(255)  NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  name            VARCHAR(120)  NOT NULL DEFAULT '',
  is_platform_admin TINYINT(1)  NOT NULL DEFAULT 0,     -- Administrador (Sistemas): opera la plataforma
  email_verified  TINYINT(1)    NOT NULL DEFAULT 0,     -- verificado vía OTP
  otp_hash        VARCHAR(255)  DEFAULT NULL,           -- HASH del OTP de registro (nunca en claro)
  otp_expires_at  BIGINT        DEFAULT NULL,
  otp_attempts    INT           NOT NULL DEFAULT 0,     -- anti fuerza bruta del OTP
  disabled_at     BIGINT        DEFAULT NULL,            -- suspensión (login bloqueado; NULL = activo)
  created_at      BIGINT        NOT NULL,
  updated_at      BIGINT        NOT NULL,
  deleted_at      BIGINT        DEFAULT NULL,            -- soft delete
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Workspaces (inquilinos) ───────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id         CHAR(36)     NOT NULL,
  name       VARCHAR(160) NOT NULL,
  owner_id   CHAR(36)     NOT NULL,
  created_at BIGINT       NOT NULL,
  updated_at BIGINT       NOT NULL,
  deleted_at BIGINT       DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_ws_owner (owner_id),
  CONSTRAINT fk_ws_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Membresías (RBAC por workspace) ───────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  id           CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  user_id      CHAR(36) NOT NULL,
  role         ENUM('OWNER','CO_MODERATOR','MEMBER') NOT NULL DEFAULT 'MEMBER',
  invited_by   CHAR(36) DEFAULT NULL,
  created_at   BIGINT   NOT NULL,
  deleted_at   BIGINT   DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ws_user (workspace_id, user_id),
  KEY idx_wm_user (user_id),
  CONSTRAINT fk_wm_ws    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_wm_user  FOREIGN KEY (user_id)      REFERENCES users(id),
  CONSTRAINT fk_wm_inv   FOREIGN KEY (invited_by)   REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. Invitaciones (flujo OTP) ──────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id           CHAR(36)     NOT NULL,
  workspace_id CHAR(36)     NOT NULL,
  email        VARCHAR(255) NOT NULL,
  otp_hash     VARCHAR(255) NOT NULL,                  -- HASH del OTP, nunca el código en claro
  role         ENUM('CO_MODERATOR','MEMBER') NOT NULL DEFAULT 'MEMBER',
  status       ENUM('PENDING','ACCEPTED','EXPIRED','REVOKED') NOT NULL DEFAULT 'PENDING',
  invited_by   CHAR(36)     DEFAULT NULL,
  attempts     INT          NOT NULL DEFAULT 0,        -- anti fuerza bruta (Fase 2)
  expires_at   BIGINT       NOT NULL,
  created_at   BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_inv_ws (workspace_id),
  KEY idx_inv_email (email),
  CONSTRAINT fk_inv_ws  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_inv_by  FOREIGN KEY (invited_by)   REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. Routers MikroTik por workspace (credenciales cifradas) ─
CREATE TABLE IF NOT EXISTS workspace_routers (
  id           CHAR(36)     NOT NULL,
  workspace_id CHAR(36)     NOT NULL,
  label        VARCHAR(120) NOT NULL DEFAULT 'MikroTik',
  host         VARCHAR(120) NOT NULL,
  api_port     INT          NOT NULL DEFAULT 8728,
  username     VARCHAR(120) NOT NULL,
  password_enc TEXT         NOT NULL,                  -- AES-256-GCM (lib/crypto.js)
  created_at   BIGINT       NOT NULL,
  updated_at   BIGINT       NOT NULL,
  deleted_at   BIGINT       DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_wr_ws (workspace_id),
  CONSTRAINT fk_wr_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. Auditoría de túneles (APPEND-ONLY, intocable) ─────────
--  tunnel_id es TEXTUAL (ppp_user / vrf), NO una FK: así el log
--  sobrevive aunque el túnel se borre lógicamente.
CREATE TABLE IF NOT EXISTS tunnel_logs (
  id           CHAR(36)     NOT NULL,
  workspace_id CHAR(36)     NOT NULL,
  tunnel_id    VARCHAR(160) NOT NULL,
  user_id      CHAR(36)     DEFAULT NULL,
  action       VARCHAR(40)  NOT NULL,                  -- ACTIVATE | DEACTIVATE | SCAN | ...
  ip_address   VARCHAR(64)  DEFAULT NULL,              -- IP del cliente que pidió la acción
  detail       TEXT         DEFAULT NULL,
  created_at   BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tl_ws (workspace_id),
  KEY idx_tl_tunnel (tunnel_id),
  KEY idx_tl_user (user_id),
  CONSTRAINT fk_tl_ws   FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_tl_user FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6b. Asignación de túneles a miembros (Roles v2 — Fase C) ──
--  Un Moderador (OWNER) asigna túneles a sus miembros (View). El
--  miembro solo ve/usa los túneles que tiene asignados.
CREATE TABLE IF NOT EXISTS tunnel_assignments (
  id            CHAR(36)     NOT NULL,
  workspace_id  CHAR(36)     NOT NULL,
  tunnel_id     VARCHAR(160) NOT NULL,   -- ppp_user / vrf (textual)
  user_id       CHAR(36)     NOT NULL,
  assigned_by   CHAR(36)     DEFAULT NULL,
  created_at    BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assign (workspace_id, tunnel_id, user_id),
  KEY idx_assign_user (user_id),
  CONSTRAINT fk_assign_ws   FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_assign_user FOREIGN KEY (user_id)      REFERENCES users(id),
  CONSTRAINT fk_assign_by   FOREIGN KEY (assigned_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6c. WireGuard por miembro (Roles v2 — Fase E) ──
CREATE TABLE IF NOT EXISTS member_wireguard (
  id            CHAR(36)     NOT NULL,
  workspace_id  CHAR(36)     NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  peer_name     VARCHAR(120) NOT NULL,
  allowed_ip    VARCHAR(64)  NOT NULL,
  public_key    VARCHAR(120),
  config_enc    TEXT,                    -- .conf cifrado (AES-256-GCM)
  created_at    BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_member_wg (workspace_id, user_id),
  CONSTRAINT fk_mwg_ws   FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  CONSTRAINT fk_mwg_user FOREIGN KEY (user_id)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 7. Intentos de autenticación (rate limiting — Fase 2) ────
CREATE TABLE IF NOT EXISTS auth_attempts (
  id          CHAR(36)    NOT NULL,
  ip_address  VARCHAR(64) NOT NULL,
  email       VARCHAR(255) DEFAULT NULL,
  kind        ENUM('LOGIN','OTP') NOT NULL,
  success     TINYINT(1)  NOT NULL DEFAULT 0,
  created_at  BIGINT      NOT NULL,
  PRIMARY KEY (id),
  KEY idx_aa_ip (ip_address, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
