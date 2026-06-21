// ============================================================
//  db/migrateScanIp.js — Crea tabla workspace_scan_ip (Opción C)
//  Idempotente: CREATE TABLE IF NOT EXISTS.
//  Uso:  cd server && npm run migrate:scanip
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
  const sqlPath = path.join(__dirname, '..', 'sql', 'schema_scan_ip.sql');
  const statements = splitStatements(fs.readFileSync(sqlPath, 'utf8'));

  console.log(`[migrate:scanip] Conectando a ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });

  try {
    for (const s of statements) await conn.query(s);

    // Alinear collation con el resto de la BD (utf8mb4_general_ci). Un schema
    // viejo creó la tabla como utf8mb4_unicode_ci → cualquier JOIN con
    // workspaces/users falla con "Illegal mix of collations". Idempotente:
    // solo convierte si difiere. Aplica a instalaciones existentes (local + prod).
    const [[row]] = await conn.query(
      `SELECT table_collation AS tc FROM information_schema.tables
        WHERE table_schema = ? AND table_name = 'workspace_scan_ip'`,
      [cfg.database]
    );
    if (row && row.tc && row.tc !== 'utf8mb4_general_ci') {
      console.log(`[migrate:scanip] Convirtiendo collation ${row.tc} → utf8mb4_general_ci ...`);
      await conn.query(
        'ALTER TABLE workspace_scan_ip CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci'
      );
    }

    console.log('[migrate:scanip] Listo. Tabla workspace_scan_ip creada/alineada.');
    process.exit(0);
  } finally { await conn.end(); }
}

main().catch((err) => { console.error('[migrate:scanip] Error:', err.message); process.exit(1); });
