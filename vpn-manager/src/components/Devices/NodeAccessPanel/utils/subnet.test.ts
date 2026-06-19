import { describe, it, expect } from 'vitest';
import { cidrOverlaps, getSubnetConflicts } from './subnet';

describe('cidrOverlaps', () => {
  it('detecta solapamiento exacto y por contención', () => {
    expect(cidrOverlaps('10.0.0.0/24', '10.0.0.0/24')).toBe(true);
    expect(cidrOverlaps('10.0.0.0/24', '10.0.0.0/16')).toBe(true); // contenida
    expect(cidrOverlaps('10.0.0.128/25', '10.0.0.0/24')).toBe(true);
  });
  it('redes disjuntas → false', () => {
    expect(cidrOverlaps('10.0.1.0/24', '10.0.2.0/24')).toBe(false);
    expect(cidrOverlaps('192.168.1.0/24', '10.0.0.0/8')).toBe(false);
  });
});

describe('getSubnetConflicts — redes reservadas (bloqueante)', () => {
  it('marca solape con la red de gestión', () => {
    expect(getSubnetConflicts(['10.13.250.0/24'])).toHaveLength(1);
    expect(getSubnetConflicts(['10.10.250.0/25'])).toHaveLength(1);
  });
  it('una LAN normal no genera conflicto', () => {
    expect(getSubnetConflicts(['10.3.0.0/24'])).toHaveLength(0);
  });
  it('ignora CIDRs malformados', () => {
    expect(getSubnetConflicts(['no-cidr', '10.3.0.0'])).toHaveLength(0);
  });
});
