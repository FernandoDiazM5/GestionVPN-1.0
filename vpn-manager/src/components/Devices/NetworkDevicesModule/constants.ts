export const SESSION_SCAN_KEY = 'vpn_scan_results_v1';
export const COLS_STORAGE_KEY = 'vpn_diag_cols_v2';

// Estima el número de hosts en un CIDR (ej: 192.168.1.0/24 → 254)
export const estimateIpCount = (cidr: string): number => {
  const m = cidr.match(/\/(\d+)$/);
  if (!m) return 254;
  const prefix = parseInt(m[1]);
  return Math.max(2, (1 << (32 - prefix)) - 2);
};

// Verifica si una IP está dentro de un bloque CIDR (ej: 10.1.1.5 en 10.1.1.0/24)
export const ipInCidr = (ip: string, cidr: string): boolean => {
  if (!ip || !cidr) return false;
  try {
    const [net, bits] = cidr.split('/');
    if (!net || !bits) return false;
    const b = 32 - parseInt(bits);
    const mask = b >= 32 ? 0 : (~((1 << b) - 1)) >>> 0;
    const toInt = (s: string) => s.split('.').reduce((a, o) => ((a << 8) >>> 0) + parseInt(o), 0) >>> 0;
    return (toInt(ip) & mask) === (toInt(net) & mask);
  } catch { return false; }
};

// Utilidades de formato
export const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1_073_741_824) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1_073_741_824).toFixed(2)} GB`;
};

export const fmtPkts = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
