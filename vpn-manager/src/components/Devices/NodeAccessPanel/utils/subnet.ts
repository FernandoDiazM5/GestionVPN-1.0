// ── Redes reservadas que no deben usarse como LAN remota de un nodo
//    (fuente única en src/config.ts, espejo de server/lib/mgmtNet.js)
import { PROTECTED_NETS } from '../../../../config';
export { PROTECTED_NETS };

// ── Helper: conversión de IP a entero
export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct)) >>> 0, 0) >>> 0;
}

// ── Helper: detección de solapamiento de subnets
export function cidrOverlaps(a: string, b: string): boolean {
  const [ipA, prefA] = a.split('/');
  const [ipB, prefB] = b.split('/');
  const maskA = prefA ? (0xFFFFFFFF << (32 - parseInt(prefA))) >>> 0 : 0xFFFFFFFF;
  const maskB = prefB ? (0xFFFFFFFF << (32 - parseInt(prefB))) >>> 0 : 0xFFFFFFFF;
  const netA = (ipToInt(ipA) & maskA) >>> 0;
  const netB = (ipToInt(ipB) & maskB) >>> 0;
  // `>>> 0` en AMBOS lados: sin él, redes con el bit alto activo (p.ej.
  // 192.168.x) quedaban con signo en (netA & maskB) y la comparación contra
  // netB (unsigned) nunca coincidía → el solape con 192.168.21.0/24 (gestión)
  // pasaba inadvertido.
  return ((netA & maskB) >>> 0) === netB || ((netB & maskA) >>> 0) === netA;
}

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

// ── Helper: obtener conflictos de subnets contra redes RESERVADAS (bloqueante)
export function getSubnetConflicts(subnets: string[]): string[] {
  const conflicts: string[] = [];
  for (const s of subnets) {
    if (!CIDR_RE.test(s.trim())) continue;
    for (const p of PROTECTED_NETS) {
      try {
        if (cidrOverlaps(s.trim(), p.cidr)) {
          conflicts.push(`${s.trim()} se solapa con ${p.label}`);
        }
      } catch { /* ignorar CIDRs malformados */ }
    }
  }
  return conflicts;
}
