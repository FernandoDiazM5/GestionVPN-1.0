-- ============================================================
--  Schema NOTIFICATIONS — suscripciones de usuario + log de envíos
--
--  Aditivo. Idempotente (ver db/migrateNotifications.js).
--
--  Diseño:
--   • 1 fila por usuario en notification_subscriptions (upsert).
--   • channels = JSON {"email": true, "telegram": false} — granular,
--     extensible (mañana agregamos webhook/slack sin migración).
--   • event_types = JSON ["TUNNEL_ACTIVATED","SESSION_EXPIRED",...] —
--     el usuario elige por cuáles quiere ser notificado.
--   • paused: TINYINT global de mute (vacaciones, mantenimiento).
--   • telegram_chat_id se obtiene por flujo de vinculación con
--     código (POST /api/account/telegram/link) — el usuario habla
--     con el bot, el bot le da un código de 6 chars, el usuario lo
--     pega en el panel → se enlaza su chat con su user_id.
--   • notification_log es APPEND-ONLY (auditoría + debug).
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  user_id          CHAR(36)     NOT NULL,
  channels         TEXT         NOT NULL DEFAULT '{"email":true,"telegram":false}',
  event_types      TEXT         NOT NULL DEFAULT '["TUNNEL_ACTIVATED","TUNNEL_DEACTIVATED","SESSION_EXPIRED"]',
  telegram_chat_id VARCHAR(64)  DEFAULT NULL,
  telegram_link_code VARCHAR(16) DEFAULT NULL,        -- código temporal para vincular
  telegram_link_expires_at BIGINT DEFAULT NULL,       -- TTL del código (15 min)
  paused           TINYINT      NOT NULL DEFAULT 0,
  created_at       BIGINT       NOT NULL,
  updated_at       BIGINT       NOT NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_notif_telegram (telegram_chat_id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_log (
  id           CHAR(36)     NOT NULL,
  user_id      CHAR(36)     NOT NULL,
  event        VARCHAR(40)  NOT NULL,
  channel      VARCHAR(20)  NOT NULL,             -- 'email' | 'telegram' | ...
  status       VARCHAR(20)  NOT NULL,             -- 'sent' | 'failed' | 'skipped'
  detail       TEXT         DEFAULT NULL,
  created_at   BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_nlog_user_created (user_id, created_at),
  KEY idx_nlog_event_status (event, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
