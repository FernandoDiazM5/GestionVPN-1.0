// ============================================================
//  wg0Sync.js — Sincroniza el `wg0` del VPS (escaneo) con la red real.
//
//  El `wg0` del VPS es config MANUAL (la app no lo gestiona). Para que el VPS
//  escanee una torre, su LAN debe estar en los `AllowedIPs` del `[Peer]`
//  (handoff §4.27). Antes había que editarlo a mano por cada torre nueva.
//
//  Este módulo es la ÚNICA fuente de verdad del parseo/edición del wg0.conf.
//  Lo usan:
//    • el hook event-driven de provisión (lib llamada con las LAN nuevas), y
//    • el CLI `db/syncWg0.js` (reconciliación completa / manual).
//
//  GUARDA DE IDEMPOTENCIA (requisito explícito): la actualización SOLO se aplica
//  si falta algún CIDR. Si todos ya están en `AllowedIPs`, es no-op: NO reescribe
//  el archivo ni recarga la interfaz.
//
//  El scan-pool (10.11.252.x) NO se gestiona aquí cuando vive en un `PostUp`
//  (`ip addr add … $i/32`): wg-quick ya lo crea al levantar la interfaz, y
//  `wg syncconf` NO toca las direcciones de la interfaz de todas formas.
// ============================================================
const fs = require('fs');
const { execFileSync } = require('child_process');

const isCidr = (s) => /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(String(s || '').trim());
// Normaliza una IP suelta a /32; deja los CIDR como están.
const toCidr = (s) => {
  const v = String(s || '').trim();
  if (!v) return '';
  return v.includes('/') ? v : `${v}/32`;
};

/**
 * Parsea un wg0.conf en sus secciones. Recoge los CIDR de [Interface].Address y
 * de [Peer].AllowedIPs (deduplicados, preservando orden de aparición). El resto
 * del archivo (llaves, Endpoint, PostUp…) se preserva tal cual al reescribir.
 * @param {string} text
 * @param {string} [scanBase] prefijo del scan-pool (ej. '10.11.252.') para
 *   detectar si se asigna por PostUp y así NO gestionar el Address.
 * @returns {{lines:string[], ifaceAddrs:string[], peerAllowed:string[], hasPostUpScan:boolean}}
 */
function parseWg0Conf(text, scanBase = '10.11.252.') {
  const lines = String(text).split(/\r?\n/);
  let section = null;
  const ifaceAddrs = [];
  const peerAllowed = [];
  const seenAddr = new Set();
  const seenAllowed = new Set();
  let hasPostUpScan = false;
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
    if (section === 'interface' && key === 'address') {
      for (const c of cidrs) { const cc = toCidr(c); if (cc && !seenAddr.has(cc)) { seenAddr.add(cc); ifaceAddrs.push(cc); } }
    }
    if (section === 'peer' && key === 'allowedips') {
      for (const c of cidrs) { if (c && !seenAllowed.has(c)) { seenAllowed.add(c); peerAllowed.push(c); } }
    }
    // Scan-pool asignado por PostUp `ip addr add` → NO tocar Address (lo duplicaría).
    if (section === 'interface' && key === 'postup' && val.includes(scanBase)) hasPostUpScan = true;
  }
  return { lines, ifaceAddrs, peerAllowed, hasPostUpScan };
}

/**
 * Recarga la config de la interfaz en vivo SIN tirar el túnel
 * (`wg syncconf <iface> <(wg-quick strip <iface>)`). Best-effort.
 * @returns {boolean} true si recargó, false si no se pudo (no `wg`, sin permisos…).
 */
function reloadWg(iface, confPath) {
  try {
    const stripped = execFileSync('wg-quick', ['strip', iface], { encoding: 'utf8' });
    const tmp = `${confPath}.stripped.tmp`;
    fs.writeFileSync(tmp, stripped);
    try { execFileSync('wg', ['syncconf', iface, tmp]); } finally { try { fs.unlinkSync(tmp); } catch { /* */ } }
    return true;
  } catch {
    return false;
  }
}

/**
 * Asegura que cada CIDR de `cidrs` esté en el `AllowedIPs` del `[Peer]` del wg0.
 *
 * GUARDA DE IDEMPOTENCIA: si TODOS ya están presentes → no-op (no reescribe ni
 * recarga). Solo si falta alguno: reescribe la línea `AllowedIPs` como la UNIÓN
 * (existentes + faltantes, sin borrar nada manual), respalda en `.bak` y recarga.
 *
 * @param {string} confPath  ruta del wg0.conf (ej. /etc/wireguard/wg0.conf)
 * @param {string[]} cidrs   CIDR a garantizar (IP suelta → /32)
 * @param {object} [opts]
 * @param {string} [opts.iface='wg0']
 * @param {boolean} [opts.apply=true]   false → solo calcula el diff, no escribe
 * @param {boolean} [opts.reload=true]  false → escribe pero no recarga wg
 * @returns {{changed:boolean, added:string[], allowed:string[], applied:boolean, reloaded:boolean}}
 */
function ensureAllowedIps(confPath, cidrs, opts = {}) {
  const { iface = 'wg0', apply = true, reload = true } = opts;
  const want = [...new Set((cidrs || []).map(toCidr).filter(isCidr))];
  const text = fs.readFileSync(confPath, 'utf8');
  const parsed = parseWg0Conf(text);
  const have = new Set(parsed.peerAllowed);
  const missing = want.filter((c) => !have.has(c));

  // ── Guarda: nada que añadir → no-op ──
  if (missing.length === 0) {
    return { changed: false, added: [], allowed: parsed.peerAllowed, applied: false, reloaded: false };
  }

  const finalAllowed = [...parsed.peerAllowed, ...missing];
  if (!apply) {
    return { changed: true, added: missing, allowed: finalAllowed, applied: false, reloaded: false };
  }

  // Reescribe SOLO la línea AllowedIPs del [Peer] con la unión; preserva el resto.
  fs.copyFileSync(confPath, `${confPath}.bak`);
  const out = [];
  let section = null;
  let wrote = false;
  for (const raw of parsed.lines) {
    const t = raw.trim();
    if (/^\[interface\]/i.test(t)) { section = 'interface'; out.push(raw); continue; }
    if (/^\[peer\]/i.test(t)) { section = 'peer'; out.push(raw); continue; }
    const m = t.match(/^([A-Za-z]+)\s*=\s*(.+)$/);
    const key = m ? m[1].toLowerCase() : null;
    if (section === 'peer' && key === 'allowedips') {
      if (!wrote) { out.push(`AllowedIPs = ${finalAllowed.join(', ')}`); wrote = true; }
      continue; // colapsa múltiples AllowedIPs en una sola línea
    }
    out.push(raw);
  }
  // Si el [Peer] no tenía línea AllowedIPs, añádela al final (caso borde).
  if (!wrote) out.push(`AllowedIPs = ${finalAllowed.join(', ')}`);
  fs.writeFileSync(confPath, out.join('\n'));

  const reloaded = reload ? reloadWg(iface, confPath) : false;
  return { changed: true, added: missing, allowed: finalAllowed, applied: true, reloaded };
}

/**
 * Modelo HARDENED (event-driven): el backend NO toca el wg0 ni gana privilegios.
 * Solo registra en un archivo de INTENCIÓN (en un dir compartido con el host) las
 * LAN que deben estar en el `AllowedIPs` del wg0. Un watcher del host (root) lo
 * aplica con `wg syncconf`. Aquí el backend solo necesita escribir un archivo.
 *
 * GUARDA: solo escribe si llega una LAN nueva (no presente ya en el intent). Si
 * todas ya estaban → no-op (no reescribe el archivo → no dispara al watcher).
 *
 * @param {string} intentPath  ruta del archivo de intención (CIDR por línea)
 * @param {string[]} cidrs     LAN a garantizar (IP suelta → /32)
 * @returns {{changed:boolean, added:string[], all:string[]}}
 */
function appendWg0Intent(intentPath, cidrs) {
  const want = [...new Set((cidrs || []).map(toCidr).filter(isCidr))];
  if (want.length === 0) return { changed: false, added: [], all: [] };
  let have = [];
  try {
    have = fs.readFileSync(intentPath, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch { /* primera vez: el archivo aún no existe */ }
  const haveSet = new Set(have);
  const missing = want.filter((c) => !haveSet.has(c));
  if (missing.length === 0) return { changed: false, added: [], all: have };   // ← guarda
  const all = [...have, ...missing];
  fs.writeFileSync(intentPath, all.join('\n') + '\n');
  return { changed: true, added: missing, all };
}

module.exports = { parseWg0Conf, ensureAllowedIps, appendWg0Intent, reloadWg, isCidr, toCidr };
