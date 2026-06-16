-- ============================================================
--  schema_scan_ip.sql — Opción C: scan-IP del VPS por workspace.
--  Cada moderador (workspace) tiene UNA IP de origen en el VPS
--  (pool 192.168.21.200-.230). El backend ata el SSH/HTTP del
--  escaneo a esa IP para que la mangle por-origen del MikroTik
--  enrute el tráfico al VRF correcto. Idempotente.
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_scan_ip (
  id           VARCHAR(36)  NOT NULL,
  workspace_id VARCHAR(36)  NOT NULL,
  scan_ip      VARCHAR(45)  NOT NULL,
  created_at   BIGINT       NOT NULL,
  updated_at   BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wsi_workspace (workspace_id),
  UNIQUE KEY uq_wsi_ip (scan_ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
