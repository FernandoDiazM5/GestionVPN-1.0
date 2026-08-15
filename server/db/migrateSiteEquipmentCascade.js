try { require('dotenv').config(); } catch (_) { /* optional */ }
const mysql = require('mysql2/promise');

const relations = [
  { table: 'aps', column: 'node_id', parent: 'nodes', constraint: 'fk_ap_node' },
  { table: 'torres', column: 'node_id', parent: 'nodes', constraint: 'fk_torre_node' },
  { table: 'cpes', column: 'ap_id', parent: 'aps', constraint: 'fk_cpe_ap' },
];

async function ensureCascade(conn, database, relation) {
  const [rows] = await conn.execute(
    `SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE
       FROM information_schema.REFERENTIAL_CONSTRAINTS rc
       JOIN information_schema.KEY_COLUMN_USAGE kcu
         ON kcu.CONSTRAINT_SCHEMA=rc.CONSTRAINT_SCHEMA AND kcu.CONSTRAINT_NAME=rc.CONSTRAINT_NAME
      WHERE rc.CONSTRAINT_SCHEMA=? AND kcu.TABLE_NAME=? AND kcu.COLUMN_NAME=?
        AND kcu.REFERENCED_TABLE_NAME=? LIMIT 1`,
    [database, relation.table, relation.column, relation.parent],
  );
  if (rows[0]?.DELETE_RULE === 'CASCADE') return false;
  const existing = rows[0]?.CONSTRAINT_NAME;
  if (existing) {
    if (!/^[A-Za-z0-9_]+$/.test(existing)) throw new Error('Nombre de constraint inválido');
    await conn.query(`ALTER TABLE \`${relation.table}\` DROP FOREIGN KEY \`${existing}\``); // nosemgrep: validated metadata and fixed table
  }
  await conn.query(
    `ALTER TABLE \`${relation.table}\` ADD CONSTRAINT \`${relation.constraint}\` FOREIGN KEY (\`${relation.column}\`) REFERENCES \`${relation.parent}\`(id) ON DELETE CASCADE`, // nosemgrep: fixed identifiers
  );
  return true;
}

async function ensureSiteCleanupTriggers(conn) {
  await conn.query('DROP TRIGGER IF EXISTS trg_nodes_cleanup_before_delete');
  await conn.query(`CREATE TRIGGER trg_nodes_cleanup_before_delete BEFORE DELETE ON nodes
    FOR EACH ROW BEGIN
      DELETE FROM tunnel_assignments
       WHERE workspace_id=OLD.workspace_id AND tunnel_id IN (OLD.ppp_user, OLD.nombre_vrf);
      DELETE FROM monitoring_state
       WHERE workspace_id=OLD.workspace_id AND target_kind='node'
         AND target_id IN (OLD.ppp_user, OLD.nombre_vrf);
      UPDATE invitations SET status='REVOKED'
       WHERE workspace_id=OLD.workspace_id AND status='PENDING'
         AND tunnel_id IN (OLD.ppp_user, OLD.nombre_vrf);
    END`);
  await conn.query('DROP TRIGGER IF EXISTS trg_nodes_cleanup_after_delete');
  await conn.query(`CREATE TRIGGER trg_nodes_cleanup_after_delete AFTER DELETE ON nodes
    FOR EACH ROW DELETE g FROM ap_groups g
      LEFT JOIN aps a ON a.ap_group_id=g.id
     WHERE g.workspace_id=OLD.workspace_id AND a.id IS NULL`);
}

async function main() {
  const database = process.env.MYSQL_DATABASE || 'vpn_manager';
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '', database,
  });
  try {
    for (const relation of relations) {
      const changed = await ensureCascade(conn, database, relation);
      console.log(`[migrate:site-cascade] ${relation.table}.${relation.column}: ${changed ? 'CASCADE aplicado' : 'correcto'}`);
    }
    await ensureSiteCleanupTriggers(conn);
    console.log('[migrate:site-cascade] triggers de dependencias textuales: correctos');
  } finally { await conn.end(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(2); });
module.exports = { ensureCascade, ensureSiteCleanupTriggers, relations };
