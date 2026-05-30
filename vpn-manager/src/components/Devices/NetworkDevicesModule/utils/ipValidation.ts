export function isValidIP(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    const num = parseInt(part);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

export function isValidCIDR(cidr: string): boolean {
  const [ip, bits] = cidr.split('/');
  if (!ip || !bits) return false;
  if (!isValidIP(ip)) return false;
  const prefix = parseInt(bits);
  return prefix >= 0 && prefix <= 32 && !isNaN(prefix);
}

export function validateIPRange(start: string, end: string): boolean {
  return isValidIP(start) && isValidIP(end);
}

export function ipStringToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function numberToIPString(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

export function cidrToRange(cidr: string): { start: string; end: string } | null {
  const [ip, bitsStr] = cidr.split('/');
  if (!ip || !bitsStr || !isValidIP(ip)) return null;

  const bits = parseInt(bitsStr);
  if (isNaN(bits) || bits < 0 || bits > 32) return null;

  const mask = (0xffffffff << (32 - bits)) >>> 0;
  const base = ipStringToNumber(ip) >>> 0;
  const network = base & mask;
  const broadcast = network | (~mask >>> 0);

  return {
    start: numberToIPString(network + 1),
    end: numberToIPString(broadcast - 1),
  };
}
