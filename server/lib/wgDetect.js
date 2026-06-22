// ============================================================
//  wgDetect.js — detección READ-ONLY de IPs WG locales de gestión.
//
//  No modifica configuración: solo compara la `local_scan_ip` configurada
//  contra las IPs realmente vivas en este equipo, para poder AVISAR (modo
//  'local') cuando la IP quedó obsoleta (WG reconectó con otra, o se tipeó
//  mal). El bug que motivó esto: una local_scan_ip que el equipo no posee
//  hace que el bind() del probe falle en silencio → 0 resultados.
//
//  Fuente de verdad de los planos de gestión: lib/mgmtNet.js.
// ============================================================
const os = require('os');
const mgmtNet = require('./mgmtNet');

/** Todas las IPv4 locales NO internas (con su interfaz). */
function localIpv4s() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const [iface, addrs] of Object.entries(ifs)) {
    for (const a of addrs || []) {
      // Node ≥18 usa family numérica (4) o string ('IPv4') según versión.
      const isV4 = a.family === 'IPv4' || a.family === 4;
      if (isV4 && !a.internal) out.push({ ip: a.address, iface });
    }
  }
  return out;
}

/** ¿`ip` está actualmente asignada a alguna interfaz local de este equipo? */
function isLocalIpv4(ip) {
  const clean = String(ip || '').split('/')[0].trim();
  if (!clean) return false;
  return localIpv4s().some((x) => x.ip === clean);
}

/**
 * IPv4 locales que caen en un plano de gestión WG (CLIENTES/ADMIN/VPS),
 * ordenadas por prioridad: CLIENTES (moderador) → ADMIN → VPS.
 * Es lo que el equipo "tiene" para originar el escaneo en modo local.
 */
function listLocalMgmtIps() {
  const planes = [
    { base: mgmtNet.clients.base, plane: mgmtNet.clients.iface, pr: 0 },
    { base: mgmtNet.admin.base,   plane: mgmtNet.admin.iface,   pr: 1 },
    { base: mgmtNet.vps.base,     plane: mgmtNet.vps.iface,     pr: 2 },
  ];
  const found = [];
  for (const x of localIpv4s()) {
    const p = planes.find((pl) => x.ip.startsWith(pl.base));
    if (p) found.push({ ip: x.ip, iface: x.iface, plane: p.plane, pr: p.pr });
  }
  return found.sort((a, b) => a.pr - b.pr).map(({ ip, iface, plane }) => ({ ip, iface, plane }));
}

module.exports = { localIpv4s, isLocalIpv4, listLocalMgmtIps };
