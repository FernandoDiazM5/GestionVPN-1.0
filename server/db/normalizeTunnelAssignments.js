// ============================================================
//  normalizeTunnelAssignments.js — M5: normaliza tunnel_assignments.tunnel_id
//  a la clave CANÓNICA `nombre_vrf`.
//
//  El frontend guardaba a veces `ppp_user` y a veces `nombre_vrf` → match dual
//  en todos los lectores (raíz del bug §36). Este script reescribe las filas
//  existentes cuyo `tunnel_id` sea un `ppp_user` al `nombre_vrf` del mismo nodo.
//  (Las escrituras NUEVAS ya quedan canónicas vía assignmentRepo.add.)
//
//  SEGURIDAD: dry-run por defecto; `--apply` para escribir; backup JSON fuera
//  del repo antes de actualizar. Filas sin nodo coincidente se dejan intactas.
//
//  Uso:
//   node db/normalizeTunnelAssignments.js            # dry-run
//   node db/normalizeTunnelAssignments.js --apply    # aplica
// ============================================================
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db.service');
const { canonicalTunnelId } = require('./repos/assignmentRepo');

(async () => {
  const apply = process.argv.includes('--apply');
  const db = await getDb();

  const rows = await db.all('SELECT id, workspace_id, tunnel_id, user_id FROM tunnel_assignments');
  console.log(`Filas en tunnel_assignments: ${rows.length}`);
  if (rows.length === 0) { console.log('Nada que normalizar. ✔'); process.exit(0); }

  const changes = [];
  for (const r of rows) {
    const canonical = await canonicalTunnelId(r.workspace_id, r.tunnel_id);
    if (canonical && canonical !== r.tunnel_id) {
      changes.push({ id: r.id, user_id: r.user_id, from: r.tunnel_id, to: canonical });
    }
  }

  console.log(`\nA normalizar (ppp_user → nombre_vrf): ${changes.length}`);
  if (changes.length === 0) { console.log('Todas las filas ya están canónicas. ✔'); process.exit(0); }
  console.table(changes.map(c => ({ from: c.from, to: c.to, user: c.user_id })));

  const backupFile = path.resolve(__dirname, '..', '..', '..', `tunnel_assignments_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(rows, null, 2));
  console.log('\nBackup de la tabla completa:', backupFile);

  if (!apply) {
    console.log('\n[DRY-RUN] No se escribió nada. Re-ejecuta con --apply para normalizar.');
    process.exit(0);
  }

  let updated = 0;
  for (const c of changes) {
    await db.run('UPDATE tunnel_assignments SET tunnel_id = ? WHERE id = ?', [c.to, c.id]);
    updated++;
  }
  console.log(`\nListo: ${updated}/${changes.length} filas normalizadas a nombre_vrf canónico.`);
  process.exit(0);
})();
