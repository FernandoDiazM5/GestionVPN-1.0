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
  // Borra sólo artefactos de carrera: mismo hilo con un registro real y otro UNREGISTERED.
  await pool.query(`DELETE unregistered FROM telegram_forum_topics unregistered
    JOIN telegram_forum_topics linked ON linked.workspace_id=unregistered.workspace_id
      AND linked.group_id=unregistered.group_id AND linked.telegram_thread_id=unregistered.telegram_thread_id
      AND linked.id<>unregistered.id AND linked.status<>'UNREGISTERED'
    WHERE unregistered.status='UNREGISTERED' AND unregistered.telegram_thread_id IS NOT NULL`);
  const [threadIndexes] = await pool.query(`SELECT INDEX_NAME FROM information_schema.statistics
    WHERE table_schema=? AND table_name='telegram_forum_topics' AND index_name='uq_telegram_topic_thread' LIMIT 1`, [dbName]);
  if (!threadIndexes.length) await pool.query('ALTER TABLE telegram_forum_topics ADD UNIQUE KEY uq_telegram_topic_thread (group_id,telegram_thread_id)');
  const [created] = await pool.query(`SELECT COUNT(*) AS total FROM information_schema.tables
    WHERE table_schema=? AND table_name IN (${TABLES.map(() => '?').join(',')})`, [dbName, ...TABLES]);
  if (Number(created[0]?.total) !== TABLES.length) throw new Error(`Migración MikroWisp/Telegram incompleta: ${created[0]?.total}/${TABLES.length}`);
  console.log(`[migrate:mikrowisp-telegram] ${TABLES.length} tablas verificadas con ${collation}`);
  await pool.end();
}

if (require.main === module) migrate().catch(error => { console.error('[migrate:mikrowisp-telegram] ERROR:', error.message); process.exit(1); });
module.exports = { TABLES, adaptSchema, migrate };
