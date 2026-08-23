const { query } = require('./mysql');
const log = require('../lib/logger').child({ scope: 'migration-platform-admin-memberships' });

// Una cuenta de plataforma sólo conserva la membresía de su propio workspace.
// Las asociaciones a workspaces de clientes son residuos históricos peligrosos:
// una operación masiva del tenant podría cerrar la sesión del Administrador.
async function removeForeignPlatformAdminMemberships(runQuery = query, now = Date.now()) {
  const result = await runQuery(
    `UPDATE workspace_members wm
       JOIN users u ON u.id = wm.user_id
       JOIN workspaces w ON w.id = wm.workspace_id
      SET wm.deleted_at = ?
      WHERE u.is_platform_admin = 1 AND u.deleted_at IS NULL
        AND wm.deleted_at IS NULL AND w.owner_id <> u.id`,
    [now]
  );
  return Number(result.affectedRows || 0);
}

async function main() {
  const removed = await removeForeignPlatformAdminMemberships();
  log.info({ removed }, 'membresías ajenas de administradores de plataforma retiradas');
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(error => {
    log.error({ err: error.message }, 'falló limpieza de membresías administrativas');
    process.exit(1);
  });
}

module.exports = { removeForeignPlatformAdminMemberships };
