// Strict, dependency-free IPv4/CIDR parsing used before generating RouterOS
// commands or WireGuard intent. Canonical output always uses the network address.

function parseIpv4(value) {
  const text = String(value ?? '').trim();
  const parts = text.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;
  return octets;
}

function ipv4ToUint(octets) {
  return (((octets[0] * 0x1000000) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0);
}

function uintToIpv4(value) {
  const n = value >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function normalizeCidr(value, options = {}) {
  const { allowHost = true, allowDefaultRoute = false } = options;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const pieces = text.split('/');
  if (pieces.length > 2 || (!allowHost && pieces.length !== 2)) return null;
  const octets = parseIpv4(pieces[0]);
  if (!octets) return null;
  const prefixText = pieces.length === 2 ? pieces[1] : '32';
  if (!/^\d{1,2}$/.test(prefixText)) return null;
  const prefix = Number(prefixText);
  if (prefix < 0 || prefix > 32 || (!allowDefaultRoute && prefix === 0)) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return `${uintToIpv4(ipv4ToUint(octets) & mask)}/${prefix}`;
}

function normalizeCidrs(values, options = {}) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const cidr = normalizeCidr(value, options);
    if (!cidr || seen.has(cidr)) continue;
    seen.add(cidr);
    out.push(cidr);
  }
  return out;
}

function isCidr(value, options = {}) {
  return normalizeCidr(value, { ...options, allowHost: false }) !== null;
}

module.exports = { parseIpv4, normalizeCidr, normalizeCidrs, isCidr };
