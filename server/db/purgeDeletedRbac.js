// ============================================================
//  purgeDeletedRbac.js — purga los residuos legacy del soft-delete.
//
//  El schema RBAC se diseñó con soft-delete (`deleted_at`), pero el código
//  pasó a HARD-delete. Quedaron zombies: workspaces/users con `deleted_at`
//  puesto + workspace_members / tunnel_assignments / invitations apuntando a
//  workspaces que ya no deberían existir. Este script los limpia.
//
//  Uso:
//    node db/purgeDeletedRbac.js            (DRY-RUN: solo reporta)
//    node db/purgeDeletedRbac.js --apply    (borra; guarda backup JSON antes)
//
//  Idempotente. El backup se escribe FUERA del repo.
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, withTransaction } = require('./mysql');

const APPLY = process.argv.includes('--apply');

// Tablas hijas a limpiar por workspace muerto (orden: hijos → padres).
const WS_CHILD_TABLES = [
  'tunnel_session_logs', 'tunnel_user_sessions', 'user_mgmt_ips', 'tunnel_logs',
  'tunnel_assignments', 'member_wireguard', 'mgmt_peer_owners', 'invitations',
  'workspace_members',
];

async function main() {
  // 1) Workspaces y users vivos (sin deleted_at)
  const liveWs = new Set((await query('SELECT id FROM workspaces WHERE deleted_at IS NULL')).map(r => r.id));
  const liveUsers = new Set((await query('SELECT id FROM users WHERE deleted_at IS NULL')).map(r => r.id));

  // 2) Workspaces muertos (soft-deleted) + workspaces "fantasma" referenciados por
  //    hijos pero inexistentes en la tabla.
  const deadWsRows = await query('SELECT id, name FROM workspaces WHERE deleted_at IS NOT NULL');
  const deadWsIds = new Set(deadWsRows.map(r => r.id));

  // IDs de workspace referenciados por hijos pero que NO están vivos (incluye
  // soft-deleted y fantasmas borrados de la tabla workspaces).
  const referenced = new Set();
  for (const t of ['workspace_members', 'tunnel_assignments', 'invitations', 'nodes', 'member_wireguard']) {
    try {
      const rows = await query(`SELECT DISTINCT workspace_id AS w FROM ${t}`);
      rows.forEach(r => { if (r.w && !liveWs.has(r.w)) referenced.add(r.w); });
    } catch { /* tabla sin workspace_id: ignorar */ }
  }
  const targetWs = new Set([...deadWsIds, ...referenced]);

  // 3) Users muertos que ya no son miembros vivos de ningún workspace vivo.
  const deadUsers = (await query('SELECT id, email FROM users WHERE deleted_at IS NOT NULL'));
  const stillMember = new Set(
    (await query(
      `SELECT DISTINCT wm.user_id AS u FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id AND w.deleted_at IS NULL`
    )).map(r => r.u)
  );
  const usersToDelete = deadUsers.filter(u => !stillMember.has(u.id) && !liveUsers.has(u.id));

  console.log('── PURGA RBAC (zombies legacy) ──');
  console.log(`Workspaces a purgar: ${targetWs.size}  (soft-deleted: ${deadWsIds.size}, fantasma referenciado: ${referenced.size})`);
  console.log(`Users muertos a borrar: ${usersToDelete.length}`);

  if (!targetWs.size && !usersToDelete.length) { console.log('✅ Nada que purgar.'); process.exit(0); }

  if (!APPLY) {
    console.log('\n(DRY-RUN) Re-ejecuta con --apply para borrar. Se hará backup JSON antes.');
    process.exit(0);
  }

  // 4) Backup JSON fuera del repo
  const backup = { ts: Date.now(), workspaces: [...targetWs], users: usersToDelete.map(u => u.id), tables: {} };
  for (const t of [...WS_CHILD_TABLES, 'nodes']) {
    try {
      const ph = [...targetWs].map(() => '?').join(',') || 'NULL';
      backup.tables[t] = await query(`SELECT * FROM ${t} WHERE workspace_id IN (${ph})`, [...targetWs]);
    } catch { /* ignore */ }
  }
  // FUERA del repo (server/db → server → repo → Desktop): el backup tiene emails.
  const backupPath = path.resolve(__dirname, `../../../GestionVPN_purge_rbac_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\n💾 Backup: ${backupPath}`);

  // 5) Borrado en transacción
  await withTransaction(async (tx) => {
    if (targetWs.size) {
      const ph = [...targetWs].map(() => '?').join(',');
      for (const t of WS_CHILD_TABLES) {
        try { await tx.query(`DELETE FROM ${t} WHERE workspace_id IN (${ph})`, [...targetWs]); } catch (e) { console.warn(`  ${t}: ${e.message}`); }
      }
      // nodes con CASCADE → aps/cpes/signal_history/node_*
      try { await tx.query(`DELETE FROM nodes WHERE workspace_id IN (${ph})`, [...targetWs]); } catch (e) { console.warn(`  nodes: ${e.message}`); }
      // workspaces (soft-deleted reales)
      const realWs = [...deadWsIds];
      if (realWs.length) await tx.query(`DELETE FROM workspaces WHERE id IN (${realWs.map(() => '?').join(',')})`, realWs);
    }
    if (usersToDelete.length) {
      const ids = usersToDelete.map(u => u.id);
      await tx.query(`DELETE FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
  });

  console.log('✅ Purga aplicada.');
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
