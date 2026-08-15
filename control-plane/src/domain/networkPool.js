'use strict';

function ipToInt(ip) {
  const parts = String(ip || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error('IPV4_INVALID');
  }
  return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function intToIp(value) {
  const ip = Number(value) >>> 0;
  return [ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.');
}

function enumerateSubnets(supernet, childPrefix = 22) {
  const match = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(String(supernet || ''));
  if (!match) throw new Error('NETWORK_POOL_INVALID');
  const prefix = Number(match[2]);
  if (prefix < 8 || prefix > childPrefix || childPrefix > 30) throw new Error('NETWORK_POOL_INVALID');
  const base = ipToInt(match[1]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  if ((base & mask) !== base) throw new Error('NETWORK_POOL_NOT_CANONICAL');
  const count = 2 ** (childPrefix - prefix);
  const size = 2 ** (32 - childPrefix);
  return Array.from({ length: count }, (_, index) => `${intToIp((base + index * size) >>> 0)}/${childPrefix}`);
}

function lowestFreeSubnet(supernet, allocated, childPrefix = 22) {
  const used = new Set(allocated || []);
  const candidate = enumerateSubnets(supernet, childPrefix).find(cidr => !used.has(cidr));
  if (!candidate) throw new Error('NETWORK_POOL_EXHAUSTED');
  return candidate;
}

module.exports = { ipToInt, intToIp, enumerateSubnets, lowestFreeSubnet };
