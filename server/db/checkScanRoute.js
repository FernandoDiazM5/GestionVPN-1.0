// ============================================================
//  checkScanRoute.js — VERIFICACIÓN de la ruta de retorno del scan-pool.
//
//  Hace EXACTAMENTE lo que el paso nuevo de "Verificar y reparar" (tunnel-repair
//  Paso 4), pero aislado y SIN escribir por defecto. Sirve para comprobar, antes
//  de tocar nada, qué VRF del router tienen (o les falta) la ruta de retorno
//  `dst=<scan-pool /24> → VPN-WG-VPS`.
//
//  SE EJECUTA: en ESTA máquina (`node db/checkScanRoute.js`), conectándose al
//  MikroTik por la RouterOS API (mismo MT_IP/MT_USER/MT_PASS de app_settings que
//  usa el backend). NO toca la base de datos ni el VPS.
//
//   node db/checkScanRoute.js          → SOLO LEE y reporta (no modifica NADA)
//   node db/checkScanRoute.js --apply  → además añade la(s) ruta(s) que falten
//                                         (idempotente, una sola /ip/route/add por VRF)
// ============================================================
const { getDb, decryptPass } = require('../db.service');
const { connectToMikrotik, safeWrite, writeIdempotent } = require('../routeros.service');
const mgmtNet = require('../lib/mgmtNet');
const scanIpRepo = require('./repos/scanIpRepo');

(async () => {
  const apply = process.argv.includes('--apply');
  const db = await getDb();
  const get = async (k) => (await db.get('SELECT value FROM app_settings WHERE `key` = ?', [k]))?.value;
  const ip = await get('MT_IP');
  const user = await get('MT_USER');
  let pass = await get('MT_PASS');
  try { pass = decryptPass(pass); } catch (_) { /* texto plano (dev) */ }

  const scanNet = scanIpRepo.poolSubnet();   // 10.11.252.0/24 (derivado del pool)
  const gw = mgmtNet.vps.iface;              // VPN-WG-VPS
  console.log(`Router ${user}@${ip} · scan-pool=${scanNet} · gateway=${gw}`);
  console.log(`Modo: ${apply ? '⚠️  APPLY (escribirá las rutas que falten)' : 'DRY-RUN (solo lectura, no escribe nada)'}\n`);

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);

    // 1) ¿Existe la interfaz gateway? (si no, la ruta no enrutaría)
    const ifaces = await safeWrite(api, ['/interface/print']);
    const gwExists = ifaces.some(i => i.name === gw);
    console.log(`Interfaz ${gw}: ${gwExists ? '✓ existe' : '✗ NO existe (la ruta no funcionaría)'}\n`);

    // 2) Por cada VRF (≠ main): ¿tiene la ruta de retorno del scan-pool?
    const vrfs = (await safeWrite(api, ['/ip/vrf/print'])).filter(v => v.name && v.name !== 'main');
    const routes = await safeWrite(api, ['/ip/route/print']);

    let missing = 0;
    for (const v of vrfs) {
      const has = routes.some(r =>
        r['dst-address'] === scanNet && r['routing-table'] === v.name && r.dynamic !== 'true'
      );
      console.log(`  ${v.name.padEnd(34)} ${has ? '✓ ya tiene la ruta' : '✗ FALTA'}`);
      if (!has) {
        missing++;
        if (apply) {
          const nd = (v.name.match(/ND\d+/i) || [''])[0];
          await writeIdempotent(api, ['/ip/route/add',
            `=dst-address=${scanNet}`, `=gateway=${gw}`, `=routing-table=${v.name}`,
            '=distance=2', `=comment=Route-${nd}-SCAN`]);
          console.log(`      → añadida (${scanNet} → ${gw})`);
        }
      }
    }
    await api.close();
    console.log(`\nVRF totales: ${vrfs.length} · sin la ruta: ${missing}${apply ? ' (añadidas)' : ' (no se tocó nada — es dry-run)'}`);
  } catch (e) {
    if (api) { try { await api.close(); } catch (_) { /* ignore */ } }
    console.error('ERR', e.message);
  }
  process.exit(0);
})();
