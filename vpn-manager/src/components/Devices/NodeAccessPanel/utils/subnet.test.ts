import { describe, it, expect } from 'vitest';
import { cidrOverlaps, getSubnetConflicts, getNodeSubnetConflicts } from './subnet';

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
    expect(getSubnetConflicts(['192.168.21.0/24'])).toHaveLength(1);
    expect(getSubnetConflicts(['10.10.250.0/25'])).toHaveLength(1);
  });
  it('una LAN normal no genera conflicto', () => {
    expect(getSubnetConflicts(['10.3.0.0/24'])).toHaveLength(0);
  });
  it('ignora CIDRs malformados', () => {
    expect(getSubnetConflicts(['no-cidr', '10.3.0.0'])).toHaveLength(0);
  });
});

describe('getNodeSubnetConflicts — solape con otros nodos (advertencia)', () => {
  const nodes = [
    { nombre_nodo: 'TORREVIC', lan_subnets: ['10.3.0.0/24', '10.4.0.0/24'] },
    { nombre_nodo: 'FIWIS', segmento_lan: '10.5.0.0/24' },
  ];

  it('detecta solape con lan_subnets de un nodo existente', () => {
    const r = getNodeSubnetConflicts(['10.3.0.0/24'], nodes);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/TORREVIC/);
  });

  it('detecta solape con segmento_lan (nodo sin lan_subnets)', () => {
    const r = getNodeSubnetConflicts(['10.5.0.128/25'], nodes);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/FIWIS/);
  });

  it('subred nueva sin solape → sin advertencias', () => {
    expect(getNodeSubnetConflicts(['10.9.0.0/24'], nodes)).toHaveLength(0);
  });

  it('sin nodos → sin advertencias', () => {
    expect(getNodeSubnetConflicts(['10.3.0.0/24'], [])).toHaveLength(0);
  });
});
