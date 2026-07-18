try { require('dotenv').config(); } catch (_) { /* optional */ }

const mysql = require('mysql2/promise');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS auth_rate_buckets (
    bucket_hash       CHAR(64)    NOT NULL,
    kind              VARCHAR(32) NOT NULL,
    count             INT UNSIGNED NOT NULL DEFAULT 0,
    window_started_at BIGINT      NOT NULL,
    blocked_until     BIGINT      NOT NULL DEFAULT 0,
    updated_at        BIGINT      NOT NULL,
    PRIMARY KEY (bucket_hash, kind),
    KEY idx_arb_updated (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin
`;

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
    multipleStatements: false,
  });
  try {
    await conn.query(CREATE_TABLE_SQL);
    console.log('[migrate:auth-rate-buckets] Buckets atómicos listos.');
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[migrate:auth-rate-buckets] Error:', err.message);
    process.exit(1);
  });
}

module.exports = { CREATE_TABLE_SQL, main };
