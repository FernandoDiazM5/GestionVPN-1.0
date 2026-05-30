import { PROTECTED_NETS } from '../constants';

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct)) >>> 0, 0) >>> 0;
}

export function cidrOverlaps(a: string, b: string): boolean {
  const [ipA, prefA] = a.split('/');
  const [ipB, prefB] = b.split('/');
  const maskA = prefA ? (0xFFFFFFFF << (32 - parseInt(prefA))) >>> 0 : 0xFFFFFFFF;
  const maskB = prefB ? (0xFFFFFFFF << (32 - parseInt(prefB))) >>> 0 : 0xFFFFFFFF;
  const netA = (ipToInt(ipA) & maskA) >>> 0;
  const netB = (ipToInt(ipB) & maskB) >>> 0;
  return (netA & maskB) === netB || (netB & maskA) === netA;
}

export function getSubnetConflicts(subnets: string[]): string[] {
  const conflicts: string[] = [];
  for (const s of subnets) {
    if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(s.trim())) continue;
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
