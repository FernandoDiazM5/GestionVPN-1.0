try { require('dotenv').config(); } catch (_) { /* optional */ }
const mysql = require('mysql2/promise');

const statements = [
  `CREATE TABLE IF NOT EXISTS ai_moderator_access (
    user_id CHAR(36) NOT NULL,
    workspace_id CHAR(36) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    changed_by_admin VARCHAR(120) NOT NULL,
    enabled_at BIGINT DEFAULT NULL,
    disabled_at BIGINT DEFAULT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id),
    KEY idx_ai_access_ws (workspace_id),
    CONSTRAINT fk_ai_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_access_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ai_user_consents (
    user_id CHAR(36) NOT NULL,
    policy_version VARCHAR(40) NOT NULL,
    accepted_at BIGINT DEFAULT NULL,
    revoked_at BIGINT DEFAULT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, policy_version),
    CONSTRAINT fk_ai_consent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ai_usage_daily (
    usage_date DATE NOT NULL,
    scope_key VARCHAR(80) NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (usage_date, scope_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ai_analysis_runs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    uuid CHAR(36) NOT NULL,
    workspace_id CHAR(36) NOT NULL,
    user_id CHAR(36) DEFAULT NULL,
    analysis_type ENUM('DEVICE','NETWORK') NOT NULL,
    snapshot_hash CHAR(64) NOT NULL,
    prompt_version VARCHAR(40) NOT NULL,
    model VARCHAR(120) NOT NULL,
    status ENUM('PENDING','SUCCEEDED','FAILED','REJECTED') NOT NULL,
    summary_json JSON DEFAULT NULL,
    scope_json JSON DEFAULT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    latency_ms INT NOT NULL DEFAULT 0,
    error_code VARCHAR(80) DEFAULT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_run_uuid (uuid),
    KEY idx_ai_run_cache (workspace_id, analysis_type, snapshot_hash, prompt_version, status, expires_at),
    KEY idx_ai_run_user_created (user_id, created_at),
    CONSTRAINT fk_ai_run_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_run_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ai_air_os_snapshots (
    id BIGINT NOT NULL AUTO_INCREMENT,
    workspace_id CHAR(36) NOT NULL,
    analysis_run_id BIGINT DEFAULT NULL,
    device_fingerprint CHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL,
    model VARCHAR(120) NOT NULL DEFAULT '',
    firmware VARCHAR(120) DEFAULT NULL,
    signal_dbm SMALLINT DEFAULT NULL,
    noise_dbm SMALLINT DEFAULT NULL,
    snr_db SMALLINT DEFAULT NULL,
    ccq_pct DECIMAL(6,2) DEFAULT NULL,
    airmax_quality_pct DECIMAL(6,2) DEFAULT NULL,
    airmax_capacity_pct DECIMAL(6,2) DEFAULT NULL,
    tx_rate_mbps DECIMAL(12,2) DEFAULT NULL,
    rx_rate_mbps DECIMAL(12,2) DEFAULT NULL,
    cpu_pct DECIMAL(6,2) DEFAULT NULL,
    memory_pct DECIMAL(6,2) DEFAULT NULL,
    temperature_c DECIMAL(7,2) DEFAULT NULL,
    risk_score SMALLINT NOT NULL DEFAULT 0,
    extra_metrics_json JSON DEFAULT NULL,
    captured_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_ai_snapshot_trend (workspace_id, device_fingerprint, captured_at),
    KEY idx_ai_snapshot_expiry (expires_at),
    CONSTRAINT fk_ai_snapshot_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_snapshot_run FOREIGN KEY (analysis_run_id) REFERENCES ai_analysis_runs(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
  });
  try {
    for (const statement of statements) await conn.query(statement);
    console.log('[migrate:air-os-ai] Tablas de análisis AirOS listas.');
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[migrate:air-os-ai] Error:', err.message);
    process.exit(1);
  });
}

module.exports = { statements };
