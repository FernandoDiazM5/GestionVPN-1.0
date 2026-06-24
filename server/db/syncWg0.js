// ============================================================
//  syncWg0.js — SINCRONIZA el `wg0` del VPS (escaneo) con la red real.
//
//  PROBLEMA (handoff §4.27 / pendiente §7): el `wg0` del VPS es config MANUAL
//  (la app NO lo gestiona). El escaneo sale atado al scan-pool 10.11.252.x y,
//  para que el probe ENTRE al túnel hacia una torre, esa LAN debe estar en los
//  `AllowedIPs` del `[Peer]` (si no, sale por eth0/internet → escaneo 0). Hoy,
//  cada torre nueva obliga a editar `wg0` a mano. Este script lo automatiza.
//
//  QUÉ SINCRONIZA (las dos cosas que el pendiente pide), de forma ADITIVA
//  (UNIÓN — nunca borra entradas que el usuario haya puesto a mano):
//    1) [Peer]      AllowedIPs  ← planos de gestión que el VPS debe alcanzar
//                                 (VPS + IP de nodo) + TODAS las LAN de torre
//                                 del address-list LIST-NET-REMOTE-TOWERS.
//    2) [Interface] Address     ← el scan-pool 10.11.252.<START..END>/32
//                                 (las IPs origen a las que se ata el escaneo).
//
//  FUENTES DE VERDAD (ya existentes, sin duplicar lógica):
//    • LAN de torre  → address-list LIST-NET-REMOTE-TOWERS del router
//                      (autoritativo, incl. nodos sin workspace_id — igual que
//                      lib/mgmtAllowedIps.readTowerLans). Fallback: tabla `nodes`.
//    • Scan-pool     → scanIpRepo (POOL_BASE/_START/_END, env SCAN_IP_POOL_*).
//    • Planos        → lib/mgmtNet (VPS / nodo).
//
//  SE EJECUTA: normalmente EN EL VPS (`node db/syncWg0.js`), donde vive `wg0`.
//  Lee el router por la RouterOS API (mismo MT_IP/MT_USER/MT_PASS de app_settings
//  que usa el backend, alcanzable por el propio wg0). Desde el equipo de dev
//  (Windows, sin wg0) sirve como GENERADOR: imprime las líneas listas para pegar.
//
//    node db/syncWg0.js                       → DRY-RUN: lee router + wg0.conf y
//                                               muestra qué FALTA (no escribe nada)
//    node db/syncWg0.js --apply               → reescribe wg0.conf (con backup .bak)
//                                               y recarga en vivo (wg syncconf)
//    node db/syncWg0.js --conf /ruta/wg0.conf → usa otra ruta (def. /etc/wireguard/wg0.conf)
//    node db/syncWg0.js --apply --no-reload   → reescribe pero NO recarga wg
//    node db/syncWg0.js --iface wg0           → nombre de interfaz para el reload
// ============================================================
const fs = require('fs');
const { execFileSync } = require('child_process');
const { getDb, decryptPass } = require('../db.service');
const { connectToMikrotik, safeWrite } = require('../routeros.service');
const mgmtNet = require('../lib/mgmtNet');
const { readTowerLans } = require('../lib/mgmtAllowedIps');
const scanIpRepo = require('./repos/scanIpRepo');

const isCidr = (s) => /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(String(s || '').trim());
// Normaliza una IP suelta a /32; deja los CIDR como están.
const toCidr = (s) => {
  const v = String(s || '').trim();
  if (!v) return '';
  return v.includes('/') ? v : `${v}/32`;
};

// ── argumentos ──
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const noReload = args.includes('--no-reload');
const confPath = (args[args.indexOf('--conf') + 1] && args.includes('--conf'))
  ? args[args.indexOf('--conf') + 1] : '/etc/wireguard/wg0.conf';
const iface = (args[args.indexOf('--iface') + 1] && args.includes('--iface'))
  ? args[args.indexOf('--iface') + 1] : 'wg0';

/**
 * Parsea un wg0.conf en sus secciones, recogiendo los CIDR de [Interface].Address
 * y de [Peer].AllowedIPs. Devuelve { lines, ifaceAddrs, peerAllowed, hasPostUpScan }.
 * No interpreta nada más: el resto del archivo (llaves, Endpoint, PostUp…) se
 * preserva tal cual al reescribir.
 */
function parseConf(text) {
  const lines = text.split(/\r?\n/);
  let section = null;
  const ifaceAddrs = new Set();
  const peerAllowed = new Set();
  let hasPostUpScan = false;
  const scanBase = scanIpRepo.POOL_BASE; // '10.11.252.'
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[interface\]/i.test(line)) { section = 'interface'; continue; }
    if (/^\[peer\]/i.test(line)) { section = 'peer'; continue; }
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].split('#')[0].trim();
    const cidrs = val.split(',').map((s) => s.trim()).filter(Boolean);
    if (section === 'interface' && key === 'address') cidrs.forEach((c) => ifaceAddrs.add(toCidr(c)));
    if (section === 'peer' && key === 'allowedips') cidrs.forEach((c) => peerAllowed.add(c));
    // Si el scan-pool se asigna por PostUp `ip addr add`, NO lo tocamos en Address
    // (lo duplicaría → wg-quick up fallaría).
    if (section === 'interface' && key === 'postup' && val.includes(scanBase)) hasPostUpScan = true;
  }
  return { lines, ifaceAddrs, peerAllowed, hasPostUpScan };
}

/** Lee las LAN de torre de la BD como fallback si el router no responde. */
async function towerLansFromDb(db) {
  const out = new Set();
  try {
    const rows = await db.all('SELECT segmento_lan, lan_subnets FROM nodes');
    for (const r of rows || []) {
      if (isCidr(r.segmento_lan)) out.add(String(r.segmento_lan).trim());
      try {
        const arr = JSON.parse(r.lan_subnets || '[]');
        if (Array.isArray(arr)) arr.forEach((c) => { if (isCidr(c)) out.add(String(c).trim()); });
      } catch { /* lan_subnets malformado */ }
    }
  } catch { /* sin tabla nodes / BD inaccesible */ }
  return [...out];
}

(async () => {
  const db = await getDb();
  const get = async (k) => (await db.get('SELECT value FROM app_settings WHERE `key` = ?', [k]))?.value;
  const ip = await get('MT_IP');
  const user = await get('MT_USER');
  let pass = await get('MT_PASS');
  try { pass = decryptPass(pass); } catch (_) { /* texto plano (dev) */ }

  const scanNet = scanIpRepo.poolSubnet();              // 10.11.252.0/24
  console.log(`Router ${user}@${ip} · conf=${confPath} · iface=${iface}`);
  console.log(`Modo: ${apply ? '⚠️  APPLY (reescribe el conf + recarga)' : 'DRY-RUN (solo lectura, no escribe nada)'}\n`);

  // 1) LAN de torre (router autoritativo → fallback BD).
  let towerLans = [];
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    towerLans = await readTowerLans(api, safeWrite);
    await api.close();
    console.log(`Router OK · LIST-NET-REMOTE-TOWERS: ${towerLans.length} LAN`);
  } catch (e) {
    if (api) { try { await api.close(); } catch (_) { /* ignore */ } }
    console.log(`⚠️  Router inalcanzable (${e.message}) → fallback a la tabla \`nodes\``);
    towerLans = await towerLansFromDb(db);
    console.log(`BD \`nodes\`: ${towerLans.length} LAN`);
  }
  towerLans = towerLans.filter(isCidr);

  // 2) Conjuntos REQUERIDOS.
  //    [Peer].AllowedIPs = planos que el VPS debe alcanzar (router API + IPs de
  //    nodo) + scan-pool (también filtra el retorno entrante) + LAN de torre.
  const requiredAllowed = [
    mgmtNet.vps.net,        // 10.12.250.0/24 — alcanzar el router (API)
    scanNet,                // 10.11.252.0/24 — retorno del escaneo
    mgmtNet.nodes.wgNet,    // 10.11.250.0/24 — IP de nodo WG
    mgmtNet.nodes.sstpNet,  // 10.11.251.0/24 — IP de nodo SSTP
    ...towerLans,           // LAN de torre (lo que cambia con cada torre nueva)
  ].filter(isCidr);

  //    [Interface].Address = scan-pool host /32 (origen del escaneo).
  const requiredAddrs = [];
  for (let i = scanIpRepo.POOL_START; i <= scanIpRepo.POOL_END; i++) {
    requiredAddrs.push(`${scanIpRepo.POOL_BASE}${i}/32`);
  }

  // 3) Estado actual del conf (si existe).
  let confText = null;
  try { confText = fs.readFileSync(confPath, 'utf8'); } catch { /* no existe (dev) */ }

  const current = confText
    ? parseConf(confText)
    : { lines: [], ifaceAddrs: new Set(), peerAllowed: new Set(), hasPostUpScan: false };

  const missingAllowed = requiredAllowed.filter((c) => !current.peerAllowed.has(c));
  const manageAddr = !current.hasPostUpScan; // PostUp ya las asigna → no tocar Address
  const missingAddrs = manageAddr
    ? requiredAddrs.filter((c) => !current.ifaceAddrs.has(c))
    : [];

  // 4) Reporte.
  console.log(`\n[Peer] AllowedIPs — faltan ${missingAllowed.length} de ${requiredAllowed.length} requeridas:`);
  if (missingAllowed.length) missingAllowed.forEach((c) => console.log(`   + ${c}`));
  else console.log('   ✓ todas presentes');

  if (!manageAddr) {
    console.log(`\n[Interface] Address — el scan-pool se asigna por PostUp (no se gestiona aquí).`);
  } else {
    console.log(`\n[Interface] Address (scan-pool) — faltan ${missingAddrs.length} de ${requiredAddrs.length}:`);
    if (missingAddrs.length) console.log(`   + ${scanIpRepo.POOL_BASE}${scanIpRepo.POOL_START}/32 … ${scanIpRepo.POOL_BASE}${scanIpRepo.POOL_END}/32`);
    else console.log('   ✓ todas presentes');
  }

  // Snippet listo para pegar (útil desde dev / sin conf).
  const finalAllowed = [...new Set([...current.peerAllowed, ...requiredAllowed])];
  const finalAddrs = manageAddr ? [...new Set([...current.ifaceAddrs, ...requiredAddrs])] : [...current.ifaceAddrs];
  if (!confText || (!apply && (missingAllowed.length || missingAddrs.length))) {
    console.log('\n── Líneas canónicas (para wg0.conf) ──');
    if (manageAddr) console.log(`[Interface]\nAddress = ${finalAddrs.join(', ')}`);
    console.log(`[Peer]\nAllowedIPs = ${finalAllowed.join(', ')}`);
  }

  // 5) Aplicar.
  if (!apply) {
    console.log(`\n(DRY-RUN — no se tocó nada. Re-ejecuta con --apply para escribir ${confPath}.)`);
    process.exit(0);
  }
  if (!confText) {
    console.error(`\n✗ No existe ${confPath} (¿estás en el VPS?). Pega las líneas de arriba a mano y recarga.`);
    process.exit(1);
  }
  if (!missingAllowed.length && !missingAddrs.length) {
    console.log('\n✓ Nada que aplicar: el wg0.conf ya está sincronizado.');
    process.exit(0);
  }

  // Reescribe SOLO las líneas gestionadas (Address en [Interface], AllowedIPs en
  // [Peer]) con la UNIÓN; el resto del archivo se preserva. Backup primero.
  fs.copyFileSync(confPath, `${confPath}.bak`);
  const out = [];
  let section = null;
  let wroteAddr = false;
  let wroteAllowed = false;
  for (const raw of current.lines) {
    const t = raw.trim();
    if (/^\[interface\]/i.test(t)) { section = 'interface'; out.push(raw); continue; }
    if (/^\[peer\]/i.test(t)) { section = 'peer'; out.push(raw); continue; }
    const m = t.match(/^([A-Za-z]+)\s*=\s*(.+)$/);
    const key = m ? m[1].toLowerCase() : null;
    if (section === 'interface' && key === 'address' && manageAddr) {
      if (!wroteAddr) { out.push(`Address = ${finalAddrs.join(', ')}`); wroteAddr = true; }
      continue; // colapsa múltiples Address en una sola línea
    }
    if (section === 'peer' && key === 'allowedips') {
      if (!wroteAllowed) { out.push(`AllowedIPs = ${finalAllowed.join(', ')}`); wroteAllowed = true; }
      continue;
    }
    out.push(raw);
  }
  fs.writeFileSync(confPath, out.join('\n'));
  console.log(`\n✓ ${confPath} actualizado (backup en ${confPath}.bak).`);

  // 6) Recarga en vivo sin tirar el túnel (wg syncconf <(wg-quick strip)).
  if (noReload) {
    console.log(`(--no-reload: aplica a mano →  wg syncconf ${iface} <(wg-quick strip ${iface}))`);
    process.exit(0);
  }
  try {
    const stripped = execFileSync('wg-quick', ['strip', iface], { encoding: 'utf8' });
    const tmp = `${confPath}.stripped.tmp`;
    fs.writeFileSync(tmp, stripped);
    execFileSync('wg', ['syncconf', iface, tmp]);
    fs.unlinkSync(tmp);
    console.log(`✓ wg syncconf ${iface} aplicado (túnel sin cortes).`);
  } catch (e) {
    console.error(`⚠️  No se pudo recargar wg (${e.message}). Aplica a mano:`);
    console.error(`     wg syncconf ${iface} <(wg-quick strip ${iface})`);
  }
  process.exit(0);
})();
