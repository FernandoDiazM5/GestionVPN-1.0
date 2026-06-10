// ============================================================
//  db/migrateNotifications.js — Crea tablas notification_*
//
//  Idempotente: usa CREATE TABLE IF NOT EXISTS.
//  Uso:  cd server && npm run migrate:notifications
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function splitStatements(sql) {
  return sql
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    .split(';').map(s => s.trim()).filter(Boolean);
}

async function main() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT) || 3306;
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'vpn_manager';

  const sqlPath = path.join(__dirname, '..', 'sql', 'schema_notifications.sql');
  const statements = splitStatements(fs.readFileSync(sqlPath, 'utf8'));

  console.log(`[migrate:notifications] Conectando a ${user}@${host}:${port}/${database} ...`);
  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: false });

  try {
    for (const s of statements) {
      await conn.query(s);
    }
    console.log('[migrate:notifications] Listo. Tablas notification_* creadas o ya existentes.');
    process.exit(0);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[migrate:notifications] Error:', err.message);
  process.exit(1);
});
