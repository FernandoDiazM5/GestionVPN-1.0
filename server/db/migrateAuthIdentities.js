try { require('dotenv').config(); } catch (_) { /* optional */ }

const mysql = require('mysql2/promise');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS auth_identities (
    id                CHAR(36)     NOT NULL,
    user_id           CHAR(36)     NOT NULL,
    provider          VARCHAR(32)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tenant_key        VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
    provider_subject  VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    email_at_link     VARCHAR(255) NOT NULL,
    created_at        BIGINT       NOT NULL,
    updated_at        BIGINT       NOT NULL,
    last_verified_at  BIGINT       DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_identity_subject (provider, tenant_key, provider_subject),
    UNIQUE KEY uq_auth_identity_user (user_id, provider, tenant_key),
    KEY idx_auth_identity_user (user_id),
    CONSTRAINT fk_auth_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
  });
  try {
    await conn.query(CREATE_TABLE_SQL);
    console.log('[migrate:auth-identities] Mapping de identidades externas listo.');
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[migrate:auth-identities] Error:', error.message);
    process.exit(1);
  });
}

module.exports = { CREATE_TABLE_SQL, main };
