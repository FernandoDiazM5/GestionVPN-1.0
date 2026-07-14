try { require('dotenv').config(); } catch (_) { /* optional */ }

const mysql = require('mysql2/promise');

async function main() {
  const cfg = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
  };
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });
  try {
    await conn.query(
      "ALTER TABLE auth_attempts MODIFY kind ENUM('LOGIN','OTP','OTP_SEND') NOT NULL"
    );
    const [indexes] = await conn.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = 'auth_attempts'
          AND index_name = 'idx_aa_email_kind' LIMIT 1`,
      [cfg.database]
    );
    if (indexes.length === 0) {
      await conn.query(
        'ALTER TABLE auth_attempts ADD INDEX idx_aa_email_kind (email, kind, created_at)'
      );
    }
    console.log('[migrate:otp-send] Rate limit persistente de envíos OTP listo.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[migrate:otp-send] Error:', err.message);
  process.exit(1);
});
