try { require('dotenv').config(); } catch (_) { /* optional */ }

const mysql = require('mysql2/promise');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS auth_sessions (
    jti         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id     CHAR(36) NOT NULL,
    expires_at  BIGINT   NOT NULL,
    revoked_at  BIGINT   DEFAULT NULL,
    created_at  BIGINT   NOT NULL,
    PRIMARY KEY (jti),
    KEY idx_auth_sessions_user (user_id, revoked_at, expires_at),
    KEY idx_auth_sessions_expiry (expires_at),
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    console.log('[migrate:auth-sessions] Sesiones revocables listas.');
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[migrate:auth-sessions] Error:', error.message);
    process.exit(1);
  });
}

module.exports = { CREATE_TABLE_SQL, main };
