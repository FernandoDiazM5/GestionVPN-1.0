// ============================================================
//  test/unit/nodeScopeLeak.test.js — regresión de aislamiento en
//  filterNodesForRole (routes/nodes/_shared.js).
//
//  Bug histórico: en el fallback de caché (router caído) un nodo
//  HUÉRFANO (workspace_id NULL o de otro workspace) que COMPARTE
//  nombre_vrf con un nodo legítimo se colaba en la vista del
//  moderador por el match laxo de wsUsers (ppp_user || nombre_vrf).
//  Eso permitía abrir el modal de borrado contra un nodo ajeno y
//  recibir 404 ("Nodo no encontrado en tu workspace") + crash de UI.
// ============================================================

const { stubModule } = require('../helpers/moduleMock');

const dbServiceMocks = stubModule(__dirname, '../../db.service', {
  getDb: vi.fn(),
});

const { filterNodesForRole, nodeBelongsToRequester } = require('../../routes/nodes/_shared');

// Sólo el nodo legítimo (id 36916) pertenece al workspace del moderador.
const OWNED_ROWS = [
  { ppp_user: 'ppp-torrehousenet-nd2', nombre_vrf: 'VRF-ND2-TORREHOUSENET' },
];

beforeEach(() => {
  vi.clearAllMocks();
  dbServiceMocks.getDb.mockResolvedValue({ all: vi.fn().mockResolvedValue(OWNED_ROWS) });
});

describe('filterNodesForRole — no fuga por VRF compartido', () => {
  const ownerReq = { account: { role: 'OWNER', workspace_id: 'ws-mod', platform_admin: false } };

  it('un nodo cacheado con workspace_id NULL pero MISMO vrf NO se cuela', async () => {
    const nodes = [
      { ppp_user: 'ppp-torrehousenet-nd2', nombre_vrf: 'VRF-ND2-TORREHOUSENET', workspace_id: 'ws-mod' },
      { ppp_user: 'TorreHousenet',         nombre_vrf: 'VRF-ND2-TORREHOUSENET', workspace_id: null }, // fantasma
    ];
    const scoped = await filterNodesForRole(ownerReq, nodes);
    expect(scoped.map(n => n.ppp_user)).toEqual(['ppp-torrehousenet-nd2']);
  });

  it('un nodo cacheado de OTRO workspace que comparte vrf NO se cuela', async () => {
    const nodes = [
      { ppp_user: 'ppp-torrehousenet-nd2', nombre_vrf: 'VRF-ND2-TORREHOUSENET', workspace_id: 'ws-mod' },
      { ppp_user: 'ajeno',                 nombre_vrf: 'VRF-ND2-TORREHOUSENET', workspace_id: 'ws-otro' },
    ];
    const scoped = await filterNodesForRole(ownerReq, nodes);
    expect(scoped.map(n => n.ppp_user)).toEqual(['ppp-torrehousenet-nd2']);
  });

  it('los nodos del router (sin workspace_id) siguen visibles por match de ppp_user/vrf', async () => {
    // Caso normal: el router NO entrega workspace_id en el objeto del nodo.
    const nodes = [
      { ppp_user: 'ppp-torrehousenet-nd2', nombre_vrf: 'VRF-ND2-TORREHOUSENET' },
    ];
    const scoped = await filterNodesForRole(ownerReq, nodes);
    expect(scoped.map(n => n.ppp_user)).toEqual(['ppp-torrehousenet-nd2']);
  });

  it('platform_admin ve todo (incluido el huérfano)', async () => {
    const adminReq = { account: { role: 'OWNER', workspace_id: 'ws-0', platform_admin: true } };
    const nodes = [
      { ppp_user: 'ppp-torrehousenet-nd2', nombre_vrf: 'VRF-ND2-TORREHOUSENET', workspace_id: 'ws-mod' },
      { ppp_user: 'TorreHousenet',         nombre_vrf: 'VRF-ND2-TORREHOUSENET', workspace_id: null },
    ];
    const scoped = await filterNodesForRole(adminReq, nodes);
    expect(scoped).toHaveLength(2);
  });
});

describe('nodeBelongsToRequester — identidad por ppp_user O vrf (consistente con visibilidad)', () => {
  const ownerReq = { account: { role: 'OWNER', workspace_id: 'ws-mod', platform_admin: false } };

  // El helper hace: SELECT 1 FROM nodes WHERE workspace_id=? AND (ppp_user=? OR (? IS NOT NULL AND nombre_vrf=?))
  // El mock devuelve "hay match" según las filas dueñas del workspace.
  function dbWith(ownedMatch) {
    return { get: vi.fn().mockResolvedValue(ownedMatch ? { 1: 1 } : null) };
  }

  it('nodo legacy VISIBLE por VRF (ppp_user del router ≠ registro de provisión) es BORRABLE', async () => {
    // El router usa ppp_user='TorreHousenet'; la fila de provisión tiene otro
    // ppp_user pero MISMO vrf. Antes daba 404 (solo miraba ppp_user).
    dbServiceMocks.getDb.mockResolvedValue(dbWith(true));
    const ok = await nodeBelongsToRequester(ownerReq, 'TorreHousenet', 'VRF-ND2-TORREHOUSENET');
    expect(ok).toBe(true);
  });

  it('nodo de OTRO workspace → false (sin match en mi workspace)', async () => {
    dbServiceMocks.getDb.mockResolvedValue(dbWith(false));
    const ok = await nodeBelongsToRequester(ownerReq, 'ajeno', 'VRF-ND9-AJENO');
    expect(ok).toBe(false);
  });

  it('platform_admin → true sin tocar BD', async () => {
    const getDb = vi.fn();
    dbServiceMocks.getDb.mockImplementation(getDb);
    const ok = await nodeBelongsToRequester(
      { account: { platform_admin: true, workspace_id: 'ws-0' } }, 'x', 'VRF-x');
    expect(ok).toBe(true);
    expect(getDb).not.toHaveBeenCalled();
  });

  it('sin ppp_user ni vrf → false', async () => {
    const ok = await nodeBelongsToRequester(ownerReq, null, null);
    expect(ok).toBe(false);
  });
});
