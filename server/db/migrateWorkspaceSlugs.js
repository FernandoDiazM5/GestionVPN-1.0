const { query } = require('./mysql');
const { allocateWorkspaceSlug } = require('../lib/workspaceSlug');

async function columnExists(name) {
  const rows = await query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspaces' AND COLUMN_NAME = ?
      LIMIT 1`,
    [name],
  );
  return rows.length > 0;
}

async function indexExists(name) {
  const rows = await query(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspaces' AND INDEX_NAME = ?
      LIMIT 1`,
    [name],
  );
  return rows.length > 0;
}

async function main() {
  if (!(await columnExists('slug'))) {
    await query(
      `ALTER TABLE workspaces
         ADD COLUMN slug VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER name`,
    );
  }

  const workspaces = await query(
    'SELECT id, name, slug FROM workspaces ORDER BY created_at ASC, id ASC',
  );
  let backfilled = 0;
  for (const workspace of workspaces) {
    if (workspace.slug) continue;
    const slug = await allocateWorkspaceSlug(query, {
      name: workspace.name,
      workspaceId: workspace.id,
    });
    await query('UPDATE workspaces SET slug = ? WHERE id = ? AND slug IS NULL', [
      slug,
      workspace.id,
    ]);
    backfilled += 1;
  }

  await query(
    `ALTER TABLE workspaces
       MODIFY slug VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL`,
  );
  if (!(await indexExists('uq_workspaces_slug'))) {
    await query('ALTER TABLE workspaces ADD UNIQUE KEY uq_workspaces_slug (slug)');
  }

  console.log(`[migrate:workspace-slugs] Listo. Backfill: ${backfilled}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[migrate:workspace-slugs] Error:', error.message);
    process.exit(1);
  });
