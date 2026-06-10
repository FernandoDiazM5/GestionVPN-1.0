// ============================================================
//  db/migratePerf.js — Aplica índices del schema_perf_indexes.sql
//
//  Idempotente: chequea information_schema.STATISTICS por nombre de
//  índice antes de cada CREATE. Re-ejecutable sin riesgo de errores
//  "Duplicate key name".
//
//  Uso:   cd server && npm run migrate:perf
//
//  Sale 0 incluso si todos los índices ya existían — útil en CI/Docker.
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/**
 * Extrae los CREATE INDEX del SQL.
 * Devuelve [{ name, table, sql }] para chequear y aplicar uno por uno.
 */
function parseCreateIndexes(sql) {
  const re = /CREATE\s+INDEX\s+(\w+)\s+ON\s+(\w+)\s*\([^)]+\)\s*;?/gi;
  const out = [];
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.push({ name: m[1], table: m[2], sql: m[0].replace(/;?\s*$/, '') });
  }
  return out;
}

async function indexExists(conn, db, table, name) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE table_schema = ? AND table_name = ? AND index_name = ?
      LIMIT 1`,
    [db, table, name]
  );
  return rows.length > 0;
}

async function main() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT) || 3306;
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'vpn_manager';

  const schemaPath = path.join(__dirname, '..', 'sql', 'schema_perf_indexes.sql');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const indexes = parseCreateIndexes(raw);

  if (indexes.length === 0) {
    console.error('[migrate:perf] No CREATE INDEX statements parsed — ¿editaste el SQL?');
    process.exit(2);
  }

  console.log(`[migrate:perf] Conectando a MySQL ${user}@${host}:${port}/${database} ...`);
  const conn = await mysql.createConnection({ host, port, user, password, database });

  let created = 0, skipped = 0, failed = 0;

  try {
    for (const idx of indexes) {
      const exists = await indexExists(conn, database, idx.table, idx.name);
      if (exists) {
        console.log(`  ✓ ya existe: ${idx.name} en ${idx.table}`);
        skipped++;
        continue;
      }
      try {
        await conn.query(idx.sql);
        console.log(`  + creado:    ${idx.name} en ${idx.table}`);
        created++;
      } catch (err) {
        console.log(`  ✗ falló:     ${idx.name} en ${idx.table} — ${err.message}`);
        failed++;
      }
    }
    console.log(`\n[migrate:perf] Resumen: ${created} creados · ${skipped} ya existían · ${failed} fallos`);
    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[migrate:perf] Error fatal:', err.message);
  process.exit(2);
});
