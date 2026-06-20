import { describe, it, expect, vi } from 'vitest';
const { resolveScanTargetVrf, lanSetOf } = require('../../lib/scanTarget');

// db.all stub que devuelve las filas de nodos configuradas por cada test.
const mkDb = (rows) => ({ all: vi.fn().mockResolvedValue(rows) });
// sessionRepo stub con la sesión activa configurable.
const mkSession = (active) => ({ getActiveByUser: vi.fn().mockResolvedValue(active) });

describe('lanSetOf', () => {
  it('une segmento_lan + lan_subnets (JSON) normalizados', () => {
    const s = lanSetOf({ segmento_lan: '10.1.1.0/24', lan_subnets: '["10.1.1.0/24","192.168.5.0/24"]' });
    expect([...s].sort()).toEqual(['10.1.1.0/24', '192.168.5.0/24']);
  });
  it('tolera lan_subnets corrupto', () => {
    const s = lanSetOf({ segmento_lan: '10.1.1.0/24', lan_subnets: '{no-json' });
    expect([...s]).toEqual(['10.1.1.0/24']);
  });
});

describe('resolveScanTargetVrf', () => {
  it('owns=false si la subred no pertenece a ningún nodo del workspace', async () => {
    const db = mkDb([{ nombre_vrf: 'VRF-ND2', segmento_lan: '10.1.1.0/24', lan_subnets: '[]' }]);
    const r = await resolveScanTargetVrf({ db, sessionRepo: mkSession(null), workspaceId: 'ws', userId: 'u', nodeLan: '8.8.8.0/24' });
    expect(r).toEqual({ owns: false, vrf: null });
  });

  it('una sola torre con la LAN → ese VRF', async () => {
    const db = mkDb([{ nombre_vrf: 'VRF-ND2-A', segmento_lan: '10.1.1.0/24', lan_subnets: '["10.1.1.0/24"]' }]);
    const r = await resolveScanTargetVrf({ db, sessionRepo: mkSession(null), workspaceId: 'ws', userId: 'u', nodeLan: '10.1.1.0/24' });
    expect(r).toEqual({ owns: true, vrf: 'VRF-ND2-A' });
  });

  it('LAN solapada en 3 nodos + sesión activa en el 2º → VRF del túnel activo (NO el primero)', async () => {
    const db = mkDb([
      { nombre_vrf: 'VRF-ND3', segmento_lan: '142.152.7.0/24', lan_subnets: '["142.152.7.0/24"]' },
      { nombre_vrf: 'VRF-ND4', segmento_lan: '142.152.7.0/24', lan_subnets: '["142.152.7.0/24"]' },
      { nombre_vrf: 'VRF-ND6', segmento_lan: '142.152.7.0/24', lan_subnets: '["142.152.7.0/24"]' },
    ]);
    const session = mkSession({ vrf_name: 'VRF-ND4' });
    const r = await resolveScanTargetVrf({ db, sessionRepo: session, workspaceId: 'ws', userId: 'u', nodeLan: '142.152.7.0/24' });
    expect(r).toEqual({ owns: true, vrf: 'VRF-ND4' }); // ← antes devolvía VRF-ND3 (bug)
  });

  it('LAN solapada SIN sesión activa → fallback al primer nodo (determinístico)', async () => {
    const db = mkDb([
      { nombre_vrf: 'VRF-ND3', segmento_lan: '142.152.7.0/24', lan_subnets: '[]' },
      { nombre_vrf: 'VRF-ND4', segmento_lan: '142.152.7.0/24', lan_subnets: '[]' },
    ]);
    const r = await resolveScanTargetVrf({ db, sessionRepo: mkSession(null), workspaceId: 'ws', userId: 'u', nodeLan: '142.152.7.0/24' });
    expect(r).toEqual({ owns: true, vrf: 'VRF-ND3' });
  });

  it('sesión activa en un VRF que NO posee esa LAN → fallback al primer nodo dueño', async () => {
    const db = mkDb([
      { nombre_vrf: 'VRF-ND3', segmento_lan: '142.152.7.0/24', lan_subnets: '[]' },
      { nombre_vrf: 'VRF-ND4', segmento_lan: '142.152.7.0/24', lan_subnets: '[]' },
    ]);
    const session = mkSession({ vrf_name: 'VRF-ND9' }); // activo en otra LAN
    const r = await resolveScanTargetVrf({ db, sessionRepo: session, workspaceId: 'ws', userId: 'u', nodeLan: '142.152.7.0/24' });
    expect(r).toEqual({ owns: true, vrf: 'VRF-ND3' });
  });
});
