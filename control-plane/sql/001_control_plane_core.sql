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

CREATE TABLE IF NOT EXISTS customer_contacts (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40) NULL,
  role ENUM('OWNER','BILLING','TECHNICAL','OTHER') NOT NULL DEFAULT 'OWNER',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_customer_contacts_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE CASCADE,
  UNIQUE KEY uq_customer_contact_email (customer_id, email),
  INDEX idx_customer_contact_primary (customer_id, is_primary, status)
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

CREATE TABLE IF NOT EXISTS subscription_plan_prices (
  id CHAR(36) PRIMARY KEY,
  plan_id CHAR(36) NOT NULL,
  billing_interval ENUM('MONTH','YEAR') NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PEN',
  amount DECIMAL(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_plan_prices_plan FOREIGN KEY (plan_id)
    REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  CONSTRAINT chk_plan_price_amount CHECK (amount >= 0),
  CONSTRAINT chk_plan_price_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
  INDEX idx_plan_price_effective (plan_id, billing_interval, is_active, effective_from)
);

CREATE TABLE IF NOT EXISTS notification_providers (
  id CHAR(36) PRIMARY KEY,
  provider_type ENUM('SMTP','TELEGRAM') NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  config_json JSON NOT NULL,
  secret_encrypted TEXT NULL,
  status ENUM('NOT_CONFIGURED','CONFIGURED','HEALTHY','ERROR','DISABLED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  last_tested_at DATETIME(3) NULL,
  last_success_at DATETIME(3) NULL,
  last_error_code VARCHAR(80) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id CHAR(36) PRIMARY KEY,
  template_key VARCHAR(80) NOT NULL,
  channel ENUM('EMAIL','TELEGRAM') NOT NULL,
  locale VARCHAR(12) NOT NULL DEFAULT 'es-PE',
  subject_template VARCHAR(250) NULL,
  body_text_template TEXT NOT NULL,
  body_html_template MEDIUMTEXT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_notification_template_version (template_key, channel, locale, version)
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

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NULL,
  instance_id CHAR(36) NULL,
  template_key VARCHAR(80) NOT NULL,
  channel ENUM('EMAIL','TELEGRAM') NOT NULL,
  recipient VARCHAR(254) NOT NULL,
  payload_json JSON NOT NULL,
  payload_secret_encrypted TEXT NULL,
  idempotency_key CHAR(64) NOT NULL UNIQUE,
  status ENUM('QUEUED','PROCESSING','DELIVERED','RETRY','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_attempt_at DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  last_error_code VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_notification_delivery_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_delivery_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE SET NULL,
  INDEX idx_notification_delivery_queue (status, next_attempt_at)
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

CREATE TABLE IF NOT EXISTS subscription_events (
  id CHAR(36) PRIMARY KEY,
  subscription_id CHAR(36) NOT NULL,
  instance_id CHAR(36) NOT NULL,
  event_type ENUM('CREATED','RENEWED','PLAN_CHANGED','GRACE_STARTED','EXPIRED','SUSPENDED','REACTIVATED','CANCELLED','NOTE_ADDED') NOT NULL,
  actor_id CHAR(36) NULL,
  reason VARCHAR(500) NULL,
  previous_values_json JSON NULL,
  new_values_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_subscription_event_subscription FOREIGN KEY (subscription_id)
    REFERENCES subscriptions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscription_event_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE RESTRICT,
  INDEX idx_subscription_events_timeline (subscription_id, created_at)
);

CREATE TABLE IF NOT EXISTS billing_sequences (
  sequence_year SMALLINT UNSIGNED PRIMARY KEY,
  next_value BIGINT UNSIGNED NOT NULL
);

CREATE TABLE IF NOT EXISTS commercial_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  legal_name VARCHAR(180) NOT NULL DEFAULT 'Joinpoint', tax_id VARCHAR(40) NULL,
  billing_email VARCHAR(254) NULL, address VARCHAR(500) NULL,
  invoice_prefix VARCHAR(12) NOT NULL DEFAULT 'JP', default_currency CHAR(3) NOT NULL DEFAULT 'PEN',
  default_tax_percent DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  invoice_due_days SMALLINT UNSIGNED NOT NULL DEFAULT 7, grace_days SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  payment_instructions TEXT NULL, brand_name VARCHAR(120) NOT NULL DEFAULT 'Joinpoint', support_email VARCHAR(254) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1, updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_commercial_settings_singleton CHECK (id=1),
  CONSTRAINT chk_commercial_tax CHECK (default_tax_percent BETWEEN 0 AND 100)
);
INSERT INTO commercial_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id=id;

CREATE TABLE IF NOT EXISTS billing_invoices (
  id CHAR(36) PRIMARY KEY,
  instance_id CHAR(36) NOT NULL,
  subscription_id CHAR(36) NULL,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  plan_id CHAR(36) NOT NULL,
  billing_interval ENUM('MONTH','YEAR','CUSTOM') NOT NULL,
  period_start DATETIME(3) NOT NULL,
  period_end DATETIME(3) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID') NOT NULL DEFAULT 'DRAFT',
  snapshot_json JSON NOT NULL,
  issued_at DATETIME(3) NULL,
  due_at DATETIME(3) NULL,
  paid_at DATETIME(3) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_billing_invoice_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_invoice_subscription FOREIGN KEY (subscription_id)
    REFERENCES subscriptions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_invoice_plan FOREIGN KEY (plan_id)
    REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  CONSTRAINT chk_billing_invoice_dates CHECK (period_end > period_start),
  CONSTRAINT chk_billing_invoice_amounts CHECK (subtotal >= 0 AND tax >= 0 AND total = subtotal + tax),
  INDEX idx_billing_invoice_status (status, due_at)
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id CHAR(36) PRIMARY KEY,
  instance_id CHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  payment_method VARCHAR(40) NOT NULL,
  reference VARCHAR(120) NULL,
  paid_at DATETIME(3) NOT NULL,
  status ENUM('PENDING_VERIFICATION','CONFIRMED','REJECTED','REFUNDED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
  evidence_url VARCHAR(1000) NULL,
  notes VARCHAR(1000) NULL,
  registered_by CHAR(36) NOT NULL,
  verified_by CHAR(36) NULL,
  verified_at DATETIME(3) NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_subscription_payment_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE RESTRICT,
  CONSTRAINT chk_subscription_payment_amount CHECK (amount > 0),
  INDEX idx_subscription_payment_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  invoice_id CHAR(36) NOT NULL,
  payment_id CHAR(36) NOT NULL,
  amount_applied DECIMAL(12,2) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (invoice_id, payment_id),
  CONSTRAINT fk_invoice_payment_invoice FOREIGN KEY (invoice_id)
    REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_payment_payment FOREIGN KEY (payment_id)
    REFERENCES subscription_payments(id) ON DELETE RESTRICT,
  CONSTRAINT chk_invoice_payment_amount CHECK (amount_applied > 0)
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

CREATE TABLE IF NOT EXISTS control_plane_admins (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret_encrypted TEXT NOT NULL,
  status ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  failed_login_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS control_plane_admin_sessions (
  id CHAR(36) PRIMARY KEY,
  admin_id CHAR(36) NOT NULL,
  token_digest CHAR(64) NOT NULL UNIQUE,
  csrf_digest CHAR(64) NOT NULL,
  source_ip_digest CHAR(64) NOT NULL,
  user_agent_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  idle_expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_admin_session_admin FOREIGN KEY (admin_id)
    REFERENCES control_plane_admins(id) ON DELETE CASCADE,
  INDEX idx_admin_session_expiry (expires_at, idle_expires_at)
);

CREATE TABLE IF NOT EXISTS control_plane_admin_recovery_codes (
  id CHAR(36) PRIMARY KEY,
  admin_id CHAR(36) NOT NULL,
  code_digest CHAR(64) NOT NULL UNIQUE,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_admin_recovery_admin FOREIGN KEY (admin_id)
    REFERENCES control_plane_admins(id) ON DELETE CASCADE,
  INDEX idx_admin_recovery_available (admin_id, consumed_at)
);

CREATE TABLE IF NOT EXISTS admin_login_rate_buckets (
  bucket_digest CHAR(64) PRIMARY KEY,
  window_started_at DATETIME(3) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_admin_login_rate_cleanup (updated_at)
);

CREATE TABLE IF NOT EXISTS license_signing_keys (
  key_id VARCHAR(80) PRIMARY KEY,
  algorithm VARCHAR(20) NOT NULL DEFAULT 'Ed25519',
  public_key_pem TEXT NOT NULL,
  public_key_fingerprint CHAR(64) NOT NULL UNIQUE,
  status ENUM('ACTIVE','VERIFY_ONLY','REVOKED') NOT NULL DEFAULT 'ACTIVE',
  activated_at DATETIME(3) NOT NULL,
  retired_at DATETIME(3) NULL
);

CREATE TABLE IF NOT EXISTS instance_licenses (
  id CHAR(36) PRIMARY KEY,
  instance_id CHAR(36) NOT NULL,
  subscription_id CHAR(36) NULL,
  key_id VARCHAR(80) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  not_before DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  grace_until DATETIME(3) NOT NULL,
  status ENUM('ISSUED','SUPERSEDED','REVOKED') NOT NULL DEFAULT 'ISSUED',
  issued_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  revoke_reason VARCHAR(500) NULL,
  CONSTRAINT fk_license_instance FOREIGN KEY (instance_id)
    REFERENCES product_instances(id) ON DELETE RESTRICT,
  CONSTRAINT fk_license_subscription FOREIGN KEY (subscription_id)
    REFERENCES subscriptions(id) ON DELETE SET NULL,
  CONSTRAINT fk_license_key FOREIGN KEY (key_id)
    REFERENCES license_signing_keys(key_id) ON DELETE RESTRICT,
  CONSTRAINT chk_license_dates CHECK (expires_at > not_before AND grace_until >= expires_at),
  INDEX idx_license_instance (instance_id, status, expires_at)
);

CREATE TABLE IF NOT EXISTS instance_request_nonces (
  instance_id CHAR(36) NOT NULL,
  nonce_digest CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (instance_id, nonce_digest),
  CONSTRAINT fk_instance_nonce_identity FOREIGN KEY (instance_id)
    REFERENCES instance_identities(instance_id) ON DELETE CASCADE,
  INDEX idx_instance_nonce_cleanup (expires_at)
);

CREATE TABLE IF NOT EXISTS activation_rate_buckets (
  bucket_digest CHAR(64) PRIMARY KEY,
  window_started_at DATETIME(3) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_activation_rate_cleanup (updated_at)
);
