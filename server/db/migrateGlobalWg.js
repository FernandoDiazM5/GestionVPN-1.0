// ============================================================
//  db/migrateGlobalWg.js — WG GLOBAL por persona (multi-workspace).
//
//  Un usuario puede pertenecer a varios workspaces; su identidad de red
//  (peer WireGuard + mgmt IP) pasa a ser ÚNICA por persona y se reutiliza
//  en todos sus workspaces:
//    • user_mgmt_ips:    UNIQUE(workspace_id,user_id) → UNIQUE(user_id)
//    • member_wireguard: UNIQUE(workspace_id,user_id) → UNIQUE(user_id)
//  `workspace_id` queda como columna informativa (dónde se provisionó).
//
//  Idempotente: detecta por information_schema si el UNIQUE ya es de 1
//  columna. Antes de cambiar el UNIQUE, deduplica por user (conserva la
//  fila más antigua — hoy no existen users multi-ws, así que es no-op) y
//  crea un índice simple sobre workspace_id para que la FK no quede sin
//  índice al dropear el UNIQUE compuesto.
//
//  Uso:  cd server && npm run migrate:globalwg
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const mysql = require('mysql2/promise');

const TABLES = [
  { table: 'user_mgmt_ips',    unique: 'uq_umi_user',   wsIdx: 'idx_umi_ws' },
  { table: 'member_wireguard', unique: 'uq_member_wg',  wsIdx: 'idx_mwg_ws' },
];

async function indexColumns(conn, db, table, index) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cols FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    [db, table, index]
  );
  return Number(rows[0]?.cols || 0);
}

async function hasIndex(conn, db, table, index) {
  return (await indexColumns(conn, db, table, index)) > 0;
}

async function main() {
  const cfg = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'vpn_manager',
  };
  console.log(`[migrate:globalwg] Conectando a ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);
  const conn = await mysql.createConnection(cfg);

  try {
    for (const { table, unique, wsIdx } of TABLES) {
      const cols = await indexColumns(conn, cfg.database, table, unique);
      if (cols === 0) {
        console.log(`[migrate:globalwg] ${table}: no existe (BD sin init) — skip`);
        continue;
      }
      if (cols === 1) {
        console.log(`[migrate:globalwg] ${table}: ${unique} ya es por user_id — skip`);
        continue;
      }

      // 1) Dedupe por user: conserva la fila más antigua (created_at, luego id).
      const [del] = await conn.query(
        `DELETE t FROM ${table} t
           JOIN ${table} k
             ON k.user_id = t.user_id
            AND (k.created_at < t.created_at OR (k.created_at = t.created_at AND k.id < t.id))`
      );
      if (del.affectedRows > 0) {
        console.log(`[migrate:globalwg] ${table}: ${del.affectedRows} fila(s) duplicada(s) por user eliminadas`);
      }

      // 2) Índice simple para la FK de workspace_id (el UNIQUE compuesto era
      //    el índice que la servía; sin esto el DROP falla con errno 1553).
      if (!(await hasIndex(conn, cfg.database, table, wsIdx))) {
        await conn.query(`ALTER TABLE ${table} ADD KEY ${wsIdx} (workspace_id)`);
      }

      // 3) UNIQUE compuesto → UNIQUE por user_id (misma key name).
      await conn.query(`ALTER TABLE ${table} DROP INDEX ${unique}`);
      await conn.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${unique} (user_id)`);
      console.log(`[migrate:globalwg] ${table}: ${unique} → UNIQUE(user_id) OK`);
    }

    console.log('[migrate:globalwg] Listo. Identidad WG global por persona.');
    process.exit(0);
  } finally { await conn.end(); }
}

main().catch((err) => { console.error('[migrate:globalwg] Error:', err.message); process.exit(1); });
