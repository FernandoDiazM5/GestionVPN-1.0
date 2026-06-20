// ============================================================
//  purgeOrphanNodes.js — limpia nodos HUÉRFANOS de la BD.
//
//  Un nodo es HUÉRFANO si existe en la tabla `nodes` pero su VRF NO existe en el
//  router (residuo de la migración 10.x: la BD quedó con nodos del esquema viejo
//  que ya no están provisionados). Borra esas filas (las FK limpian aps/cpes/
//  signal_history en cascada).
//
//  SEGURIDAD:
//   • Dry-run por DEFECTO. Solo borra con `--apply`.
//   • ABORTA si no puede leer los VRF del router (sin esa lista no se puede
//     determinar huérfanos con seguridad → nunca borra "a ciegas").
//   • Hace backup JSON de las filas a borrar (fuera del repo) antes de borrar.
//
//  Uso:
//   node db/purgeOrphanNodes.js            # dry-run: muestra qué borraría
//   node db/purgeOrphanNodes.js --apply    # borra (tras backup)
// ============================================================
const fs = require('fs');
const path = require('path');
const { getDb, deleteNode, decryptPass } = require('../db.service');
const { connectToMikrotik, safeWrite } = require('../routeros.service');

async function liveVrfsFromRouter(db) {
  const get = async (k) => (await db.get('SELECT value FROM app_settings WHERE `key` = ?', [k]))?.value;
  const ip = await get('MT_IP');
  const user = await get('MT_USER');
  let pass = await get('MT_PASS');
  try { pass = decryptPass(pass); } catch (_) { /* texto plano (dev) */ }
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const vrfs = await safeWrite(api, ['/ip/vrf/print']);
    await api.close();
    return new Set((vrfs || []).map(v => v.name).filter(n => n && n !== 'main'));
  } catch (e) {
    if (api) { try { await api.close(); } catch (_) { /* ignore */ } }
    throw new Error(`No se pudo leer los VRF del router (${ip}): ${e.message}`);
  }
}

(async () => {
  const apply = process.argv.includes('--apply');
  const db = await getDb();

  const nodes = await db.all(
    'SELECT ppp_user, nombre_vrf, nombre_nodo, node_number, protocol, segmento_lan, ip_tunnel, workspace_id FROM nodes'
  );

  let liveVrfs;
  try {
    liveVrfs = await liveVrfsFromRouter(db);
  } catch (e) {
    console.error('✗ ABORTADO —', e.message);
    console.error('  Sin la lista de VRF vivos NO se puede determinar huérfanos. No se borró nada.');
    process.exit(1);
  }

  console.log('VRFs vivos en el router:', [...liveVrfs].join(', ') || '(ninguno)');

  // Huérfano = sin nombre_vrf, o con un VRF que no existe en el router.
  const orphans = nodes.filter(n => !n.nombre_vrf || !liveVrfs.has(n.nombre_vrf));
  const live = nodes.filter(n => n.nombre_vrf && liveVrfs.has(n.nombre_vrf));

  console.log(`\nNodos en BD: ${nodes.length} · vivos (con VRF en router): ${live.length} · HUÉRFANOS: ${orphans.length}`);
  if (live.length) {
    console.log('\nSe CONSERVAN (VRF vivo):');
    console.table(live.map(n => ({ ppp_user: n.ppp_user, vrf: n.nombre_vrf, nd: n.node_number, proto: n.protocol })));
  }
  if (orphans.length === 0) { console.log('\nNada que purgar. ✔'); process.exit(0); }

  console.log('\nHUÉRFANOS (se borrarían):');
  console.table(orphans.map(n => ({ ppp_user: n.ppp_user, vrf: n.nombre_vrf || '(vacío)', nd: n.node_number, proto: n.protocol, lan: n.segmento_lan })));

  // Backup fuera del repo (Desktop), por si hay que restaurar.
  const backupFile = path.resolve(__dirname, '..', '..', '..', `orphan_nodes_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(orphans, null, 2));
  console.log('\nBackup de las filas a borrar:', backupFile);

  if (!apply) {
    console.log('\n[DRY-RUN] No se borró nada. Re-ejecuta con --apply para eliminar.');
    process.exit(0);
  }

  let deleted = 0;
  for (const n of orphans) {
    try {
      await deleteNode(n.ppp_user);
      deleted++;
      console.log(`✓ borrado ${n.ppp_user} (${n.nombre_vrf || 'sin VRF'})`);
    } catch (e) {
      console.error(`✗ ${n.ppp_user}: ${e.message}`);
    }
  }
  console.log(`\nListo: ${deleted}/${orphans.length} nodos huérfanos borrados (cascada FK: aps/cpes/signal_history).`);
  process.exit(0);
})();
