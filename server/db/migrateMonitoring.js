// ============================================================
//  db/migrateMonitoring.js — Crea tabla monitoring_state (M5)
//  Idempotente: CREATE TABLE IF NOT EXISTS.
//  Uso:  cd server && npm run migrate:monitoring
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
  const cfg = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
  };
  const sqlPath = path.join(__dirname, '..', 'sql', 'schema_monitoring.sql');
  const statements = splitStatements(fs.readFileSync(sqlPath, 'utf8'));

  console.log(`[migrate:monitoring] Conectando a ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });

  try {
    for (const s of statements) await conn.query(s);
    console.log('[migrate:monitoring] Listo. Tabla monitoring_state creada o ya existente.');
    process.exit(0);
  } finally { await conn.end(); }
}

main().catch((err) => { console.error('[migrate:monitoring] Error:', err.message); process.exit(1); });
