-- Plataforma Central Joinpoint: clientes, instancias, planes y activaciones.
-- MySQL 8 / MariaDB 11. Los secretos y códigos en claro nunca se persisten.

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3)
);

INSERT INTO platform_settings (setting_key, setting_value)
VALUES ('root_domain', 'joinpoint.cloud')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

INSERT INTO platform_settings (setting_key, setting_value)
VALUES ('network_pool', '10.64.0.0/12')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

CREATE TABLE IF NOT EXISTS customers (
  id CHAR(36) PRIMARY KEY,
  legal_name VARCHAR(180) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  tax_id VARCHAR(40) NULL,
  status ENUM('ACTIVE','SUSPENDED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
  plan_id CHAR(36) NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  numeric_limit BIGINT UNSIGNED NULL,
  config_json JSON NULL,
  PRIMARY KEY (plan_id, feature_key),
  CONSTRAINT fk_plan_entitlements_plan FOREIGN KEY (plan_id)
    REFERENCES subscription_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_instances (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  subdomain_label VARCHAR(63) NOT NULL UNIQUE,
  public_ip VARCHAR(45) NULL,
  status ENUM('PENDING_ACTIVATION','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELLED','TERMINATED','SUPPORT_LOCK')
    NOT NULL DEFAULT 'PENDING_ACTIVATION',
  software_version VARCHAR(50) NULL,
  activated_at DATETIME(3) NULL,
  last_seen_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_instances_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS instance_identities (
  instance_id CHAR(36) PRIMARY KEY,
  public_key_pem TEXT NOT NULL,
  public_key_fingerprint CHAR(64) NOT NULL UNIQUE,
  issued_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  CONSTRAINT fk_instance_identity FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activation_codes (
  id CHAR(36) PRIMARY KEY,
  instance_id CHAR(36) NOT NULL,
  code_digest CHAR(64) NOT NULL UNIQUE,
  status ENUM('ISSUED','CONSUMED','EXPIRED','REVOKED') NOT NULL DEFAULT 'ISSUED',
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  consumed_ip VARCHAR(45) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_activation_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE CASCADE,
  INDEX idx_activation_lookup (status, expires_at),
  INDEX idx_activation_instance (instance_id, created_at)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) PRIMARY KEY,
  instance_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  status ENUM('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELLED') NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  grace_ends_at DATETIME(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_subscription_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id)
    REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  CONSTRAINT chk_subscription_dates CHECK (ends_at > starts_at),
  INDEX idx_subscription_effective (instance_id, status, ends_at)
);

CREATE TABLE IF NOT EXISTS network_allocations (
  id CHAR(36) PRIMARY KEY,
  instance_id CHAR(36) NOT NULL UNIQUE,
  management_cidr VARCHAR(18) NOT NULL UNIQUE,
  status ENUM('RESERVED','ASSIGNED','RELEASED') NOT NULL DEFAULT 'RESERVED',
  assigned_at DATETIME(3) NULL,
  released_at DATETIME(3) NULL,
  CONSTRAINT fk_network_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS control_plane_audit_events (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NULL,
  customer_id CHAR(36) NULL,
  instance_id CHAR(36) NULL,
  event_type VARCHAR(80) NOT NULL,
  outcome ENUM('SUCCESS','DENIED','FAILED') NOT NULL,
  reason VARCHAR(500) NULL,
  detail_json JSON NULL,
  source_ip VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_cp_audit_instance (instance_id, created_at),
  INDEX idx_cp_audit_customer (customer_id, created_at)
);
