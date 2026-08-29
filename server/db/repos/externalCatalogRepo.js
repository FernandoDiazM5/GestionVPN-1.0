const { query, withTransaction } = require('../mysql');

function publicRow(row) {
  let metadata = {};
  try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) { /* dato histórico inválido */ }
  return {
    type: row.catalog_type,
    externalId: row.external_id,
    name: row.display_name,
    metadata,
    lastSyncedAt: Number(row.last_synced_at),
  };
}

async function list(workspaceId, type) {
  const rows = await query(`SELECT catalog_type,external_id,display_name,metadata_json,last_synced_at
    FROM external_catalog_entries WHERE workspace_id=? AND catalog_type=? ORDER BY display_name,external_id`, [workspaceId, type]);
  return rows.map(publicRow);
}

async function replace(workspaceId, type, entries, syncedAt = Date.now()) {
  await withTransaction(async tx => {
    await tx.query('DELETE FROM external_catalog_entries WHERE workspace_id=? AND catalog_type=?', [workspaceId, type]);
    for (const entry of entries) {
      await tx.query(`INSERT INTO external_catalog_entries
        (workspace_id,catalog_type,external_id,display_name,metadata_json,last_synced_at) VALUES (?,?,?,?,?,?)`,
      [workspaceId, type, entry.externalId, entry.name, JSON.stringify(entry.metadata || {}), syncedAt]);
    }
    await tx.query(`INSERT INTO external_catalog_sync_state (workspace_id,catalog_type,entry_count,last_synced_at)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE entry_count=VALUES(entry_count),last_synced_at=VALUES(last_synced_at)`,
    [workspaceId, type, entries.length, syncedAt]);
  });
  return list(workspaceId, type);
}

async function listStates(workspaceId) {
  const rows = await query('SELECT catalog_type,entry_count,last_synced_at FROM external_catalog_sync_state WHERE workspace_id=?', [workspaceId]);
  return new Map(rows.map(row => [row.catalog_type, { count: Number(row.entry_count), lastSyncedAt: Number(row.last_synced_at) }]));
}

async function resolveName(workspaceId, type, externalId) {
  const rows = await query(`SELECT display_name FROM external_catalog_entries
    WHERE workspace_id=? AND catalog_type=? AND external_id=? LIMIT 1`, [workspaceId, type, String(externalId)]);
  return rows[0]?.display_name || null;
}

module.exports = { list, replace, listStates, resolveName, publicRow };
