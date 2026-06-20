// M5 — canonicalTunnelId normaliza el tunnel_id a `nombre_vrf` (clave canónica).
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

// Stub de ../mysql (query) ANTES de require del repo.
const mysql = stubModule(__dirname, '../../db/mysql', { query: vi.fn() });
const { canonicalTunnelId } = require('../../db/repos/assignmentRepo');

beforeEach(() => vi.clearAllMocks());

describe('canonicalTunnelId (M5)', () => {
  it('ppp_user → devuelve el nombre_vrf del nodo', async () => {
    mysql.query.mockResolvedValueOnce([{ nombre_vrf: 'VRF-ND2-HOUSENET' }]);
    const r = await canonicalTunnelId('ws-1', 'housenet'); // el front mandó el ppp_user
    expect(r).toBe('VRF-ND2-HOUSENET');
    // matchea por nombre_vrf O ppp_user, scoped al workspace
    const [sql, params] = mysql.query.mock.calls[0];
    expect(sql).toMatch(/nombre_vrf = \? OR ppp_user = \?/);
    expect(params).toEqual(['ws-1', 'housenet', 'housenet']);
  });

  it('nombre_vrf ya canónico → se devuelve igual', async () => {
    mysql.query.mockResolvedValueOnce([{ nombre_vrf: 'VRF-ND2-HOUSENET' }]);
    expect(await canonicalTunnelId('ws-1', 'VRF-ND2-HOUSENET')).toBe('VRF-ND2-HOUSENET');
  });

  it('id sin nodo coincidente → se deja tal cual (no se pierde la asignación)', async () => {
    mysql.query.mockResolvedValueOnce([]);
    expect(await canonicalTunnelId('ws-1', 'VRF-FANTASMA')).toBe('VRF-FANTASMA');
  });

  it('id vacío/nulo → passthrough sin consultar', async () => {
    expect(await canonicalTunnelId('ws-1', '')).toBe('');
    expect(await canonicalTunnelId('ws-1', null)).toBe(null);
    expect(mysql.query).not.toHaveBeenCalled();
  });
});
