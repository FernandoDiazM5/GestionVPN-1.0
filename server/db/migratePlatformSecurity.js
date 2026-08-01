const { query } = require('./mysql');

async function run() {
  await query(`CREATE TABLE IF NOT EXISTS platform_security_audit (
    id CHAR(36) PRIMARY KEY,
    actor_user_id CHAR(36) NOT NULL,
    action VARCHAR(64) NOT NULL,
    target VARCHAR(64) NULL,
    jail VARCHAR(64) NULL,
    category VARCHAR(32) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    outcome ENUM('SUCCESS','FAILED') NOT NULL,
    detail JSON NULL,
    request_ip VARCHAR(64) NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_psa_created (created_at),
    INDEX idx_psa_target_created (target, created_at),
    CONSTRAINT fk_psa_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS platform_security_trusted (
    target VARCHAR(64) PRIMARY KEY,
    category VARCHAR(32) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    actor_user_id CHAR(36) NOT NULL,
    created_at BIGINT NOT NULL,
    CONSTRAINT fk_pst_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS platform_security_stepups (
    token_hash CHAR(64) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    session_jti CHAR(36) NOT NULL,
    method ENUM('PASSWORD','GOOGLE') NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_pss_expiry (expires_at),
    CONSTRAINT fk_pss_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS account_login_security (
    user_id CHAR(36) PRIMARY KEY,
    failures_15m INT NOT NULL DEFAULT 0,
    window_15m_started_at BIGINT NOT NULL DEFAULT 0,
    failures_24h INT NOT NULL DEFAULT 0,
    window_24h_started_at BIGINT NOT NULL DEFAULT 0,
    locked_until BIGINT NULL,
    lock_reason VARCHAR(64) NULL,
    last_failure_at BIGINT NULL,
    last_failure_ip VARCHAR(64) NULL,
    updated_at BIGINT NOT NULL,
    INDEX idx_als_locked (locked_until),
    CONSTRAINT fk_als_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS web_security_events (
    id CHAR(36) PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL,
    source_ip VARCHAR(64) NOT NULL,
    identity_hash CHAR(64) NULL,
    user_id CHAR(36) NULL,
    route_group VARCHAR(160) NULL,
    method VARCHAR(10) NULL,
    status_code SMALLINT NULL,
    detail JSON NULL,
    occurred_at BIGINT NOT NULL,
    INDEX idx_wse_time (occurred_at),
    INDEX idx_wse_ip_time (source_ip, occurred_at),
    INDEX idx_wse_type_time (event_type, occurred_at),
    INDEX idx_wse_user_time (user_id, occurred_at),
    CONSTRAINT fk_wse_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS web_security_actions (
    id CHAR(36) PRIMARY KEY,
    idempotency_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_ip VARCHAR(64) NOT NULL,
    recommendation VARCHAR(64) NOT NULL,
    jail VARCHAR(64) NOT NULL,
    status ENUM('PENDING','APPLIED','FAILED') NOT NULL,
    detail JSON NULL,
    expires_at BIGINT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE KEY uq_wsa_idempotency (idempotency_key),
    INDEX idx_wsa_ip_created (source_ip, created_at),
    INDEX idx_wsa_status_created (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS platform_security_active_admin_ips (
    source_ip VARCHAR(64) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    last_seen_at BIGINT NOT NULL,
    INDEX idx_psaai_seen (last_seen_at),
    CONSTRAINT fk_psaai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  console.log('[migrate:platform-security] tablas listas');
}

if (require.main === module) run().then(() => process.exit(0)).catch((e) => {
  console.error('[migrate:platform-security] ERROR:', e.message); process.exit(1);
});
module.exports = { run };
