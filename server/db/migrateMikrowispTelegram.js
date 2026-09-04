const fs = require('node:fs');
const path = require('node:path');
const { getPool } = require('./mysql');

const TABLES = Object.freeze([
  'workspace_integrations', 'platform_integrations', 'external_catalog_entries',
  'external_catalog_sync_state', 'integration_guides', 'telegram_forum_groups',
  'telegram_forum_topics', 'telegram_forum_participants', 'telegram_forum_audit',
  'telegram_group_profiles', 'telegram_topic_bulk_jobs', 'telegram_topic_bulk_items',
  'fiber_routes', 'fiber_route_elements', 'fiber_route_measurements',
  'fiber_route_evidence', 'fiber_route_events',
]);

function adaptSchema(raw, collation) {
  if (!/^[a-z0-9_]+$/i.test(collation)) throw new Error('Collation MySQL inválida');
  const wanted = new Set(TABLES);
  return raw.split(';').map(value => value.trim()).filter(statement => {
    const match = /^CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/i.exec(statement);
    return match && wanted.has(match[1]);
  }).map(statement => `${statement.replace(/COLLATE=utf8mb4_[a-z0-9_]+/i, `COLLATE=${collation}`)};`);
}

async function migrate() {
  const pool = getPool();
  const dbName = process.env.MYSQL_DATABASE || 'vpn_manager';
  const [rows] = await pool.query(`SELECT table_collation FROM information_schema.tables
    WHERE table_schema=? AND table_name='workspaces' LIMIT 1`, [dbName]);
  const collation = rows[0]?.table_collation;
  if (!collation) throw new Error('No se pudo determinar la collation de workspaces');
  const raw = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema_ops.sql'), 'utf8');
  const statements = adaptSchema(raw, collation);
  if (statements.length !== TABLES.length) throw new Error(`Esquema MikroWisp/Telegram incompleto: ${statements.length}/${TABLES.length}`);
  for (const statement of statements) await pool.query(statement);
  const [retryColumns] = await pool.query("SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=? AND table_name='telegram_topic_bulk_jobs' AND column_name='retry_at'", [dbName]);
  if (!retryColumns.length) await pool.query('ALTER TABLE telegram_topic_bulk_jobs ADD COLUMN retry_at BIGINT DEFAULT NULL');
  const [created] = await pool.query(`SELECT COUNT(*) AS total FROM information_schema.tables
    WHERE table_schema=? AND table_name IN (${TABLES.map(() => '?').join(',')})`, [dbName, ...TABLES]);
  if (Number(created[0]?.total) !== TABLES.length) throw new Error(`Migración MikroWisp/Telegram incompleta: ${created[0]?.total}/${TABLES.length}`);
  console.log(`[migrate:mikrowisp-telegram] ${TABLES.length} tablas verificadas con ${collation}`);
  await pool.end();
}

if (require.main === module) migrate().catch(error => { console.error('[migrate:mikrowisp-telegram] ERROR:', error.message); process.exit(1); });
module.exports = { TABLES, adaptSchema, migrate };
