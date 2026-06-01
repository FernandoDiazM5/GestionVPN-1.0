// ============================================================
//  Migración de datos SQLite → MySQL (one-shot)
//
//  Copia todas las filas de las 14 tablas operativas desde
//  database.sqlite a MySQL, preservando los `id` para mantener
//  intactas las claves foráneas. Idempotente: limpia las tablas
//  MySQL antes de insertar (FOREIGN_KEY_CHECKS=0).
//
//  Requisito: el schema operativo MySQL ya debe existir
//  (lo crea db.service.initDb() / o se ejecuta antes).
//
//  Ejecutar:  cd server && npm run migrate:sqlite
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { getPool, closePool } = require('./mysql');
const { initDb } = require('../db.service');

// Tras la migración los archivos SQLite se archivan en server/_legacy_sqlite/.
// Este script es de un solo uso (ya ejecutado) y queda como referencia histórica;
// requiere reinstalar `sqlite`/`sqlite3` para volver a correr.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const DB_FILE = fs.existsSync(path.join(DATA_DIR, 'database.sqlite'))
  ? path.join(DATA_DIR, 'database.sqlite')
  : path.join(__dirname, '..', '_legacy_sqlite', 'database.sqlite');

// Orden padre → hijo (respeta las FK aun con checks activos)
const TABLES = [
  'tags',
  'nodes',
  'node_ssh_creds',
  'node_tags',
  'node_history',
  'torres',
  'torre_ptp_endpoints',
  'ap_groups',
  'aps',
  'cpes',
  'signal_history',
  'vpn_users',
  'app_settings',
  'peer_colors',
];

async function migrateTable(sdb, conn, table) {
  let rows;
  try { rows = await sdb.all(`SELECT * FROM ${table}`); }
  catch (e) { console.log(`  · ${table}: omitida (${e.message})`); return 0; }
  if (!rows.length) { console.log(`  · ${table}: 0 filas`); return 0; }

  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `\`${c}\``).join(', ');
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`;

  let ok = 0;
  for (const r of rows) {
    const params = cols.map(c => (r[c] === undefined ? null : r[c]));
    try { await conn.query(sql, params); ok++; }
    catch (e) { console.warn(`  ! ${table} id=${r.id ?? '?'}: ${e.message.substring(0, 90)}`); }
  }
  console.log(`  ✓ ${table}: ${ok}/${rows.length} filas`);
  return ok;
}

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`[migrate] No existe ${DB_FILE} — nada que migrar.`);
    process.exit(1);
  }

  // 1) Asegura el schema operativo MySQL
  await initDb();

  // 2) Abre SQLite (lectura)
  const sdb = await open({ filename: DB_FILE, driver: sqlite3.Database });

  // 3) Migra dentro de una conexión con FK checks desactivados
  const conn = await getPool().getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Limpia tablas destino (hijo → padre)
    for (const t of [...TABLES].reverse()) {
      await conn.query(`DELETE FROM \`${t}\``).catch(() => {});
    }

    let total = 0;
    console.log('[migrate] Copiando filas SQLite → MySQL...');
    for (const t of TABLES) total += await migrateTable(sdb, conn, t);

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`[migrate] Completado — ${total} filas migradas.`);
  } finally {
    conn.release();
    await sdb.close();
    await closePool();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[migrate] ERROR:', e);
  process.exit(1);
});
