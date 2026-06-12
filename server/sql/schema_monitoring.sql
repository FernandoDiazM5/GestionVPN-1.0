-- ============================================================
--  Schema MONITORING — estado de monitoreo proactivo (M5)
--
--  Aditivo. Idempotente con CREATE TABLE IF NOT EXISTS.
--
--  Por cada (workspace_id, target) guardamos:
--   • last_status     'up' | 'down' | 'unknown' (a primer chequeo)
--   • fail_count      contador anti-flap (cuántos polls seguidos fallaron)
--   • last_check_at   epoch ms del último poll
--   • last_alert_at   epoch ms de la última notif DOWN enviada (cooldown)
--   • last_recovery_at epoch ms del último UP tras un DOWN
--
--  target_kind = 'node' por ahora. Diseñado para que agregar 'ap' (Ubiquiti)
--  o 'router' (MikroTik core) en el futuro no requiera migración.
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS monitoring_state (
  workspace_id     CHAR(36)     NOT NULL,
  target_kind      VARCHAR(20)  NOT NULL,           -- 'node' | 'ap' | 'router'
  target_id        VARCHAR(190) NOT NULL,           -- ppp_user del nodo, uuid del AP, etc.
  last_status      VARCHAR(20)  NOT NULL DEFAULT 'unknown',
  fail_count       INT          NOT NULL DEFAULT 0,
  last_check_at    BIGINT       NOT NULL DEFAULT 0,
  last_alert_at    BIGINT       DEFAULT NULL,
  last_recovery_at BIGINT       DEFAULT NULL,
  PRIMARY KEY (workspace_id, target_kind, target_id),
  KEY idx_mon_status (last_status, last_check_at),
  CONSTRAINT fk_mon_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
