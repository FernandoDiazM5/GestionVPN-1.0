// ============================================================
//  test/unit/tenantScope.test.js — helpers de aislamiento multi-tenant
//
//  Cada moderador ve solo sus datos; el platform_admin ve todo.
//  Estos tests verifican esa garantía con un DB stub minimalista.
// ============================================================
const scope = require('../../lib/tenantScope');

// db stub: implementa solo lo que tenantScope necesita (db.get, db.all).
// Cada test pasa sus filas custom via constructor.
function makeDb({ all = [], get = null } = {}) {
  return {
    all: vi.fn().mockResolvedValue(all),
    get: vi.fn().mockResolvedValue(get),
  };
}

describe('reqWorkspace', () => {
  it('devuelve null para platform_admin (sin restricción)', () => {
    expect(scope.reqWorkspace({ account: { platform_admin: true } })).toBeNull();
  });

  it('devuelve null cuando no hay account (request anónimo)', () => {
    expect(scope.reqWorkspace({})).toBeNull();
  });

  it('devuelve el workspace_id para un moderador (OWNER)', () => {
    const req = { account: { role: 'OWNER', workspace_id: 'ws-42' } };
    expect(scope.reqWorkspace(req)).toBe('ws-42');
  });

  it('devuelve "__none__" cuando hay account pero sin workspace_id', () => {
    // Caso degradado: usuario logueado sin membership. No queremos null
    // (que abriría todo) — devolvemos un valor sentinela.
    const req = { account: { role: 'MEMBER' } };
    expect(scope.reqWorkspace(req)).toBe('__none__');
  });
});

describe('ownedGroupIntIds', () => {
  it('platform_admin → null (sin restricción)', async () => {
    const db = makeDb();
    const ids = await scope.ownedGroupIntIds(db, { account: { platform_admin: true } });
    expect(ids).toBeNull();
    expect(db.all).not.toHaveBeenCalled();
  });

  it('moderador → array de IDs de ap_groups filtrado por workspace_id', async () => {
    const db = makeDb({ all: [{ id: 1 }, { id: 7 }, { id: 12 }] });
    const ids = await scope.ownedGroupIntIds(db, {
      account: { role: 'OWNER', workspace_id: 'ws-42' },
    });
    expect(ids).toEqual([1, 7, 12]);
    expect(db.all).toHaveBeenCalledWith(
      expect.stringContaining('FROM ap_groups WHERE workspace_id'),
      ['ws-42'],
    );
  });

  it('moderador sin grupos → [] (no null)', async () => {
    const db = makeDb({ all: [] });
    const ids = await scope.ownedGroupIntIds(db, {
      account: { role: 'OWNER', workspace_id: 'ws-x' },
    });
    expect(ids).toEqual([]);
  });
});

describe('ownedApIntIds', () => {
  it('platform_admin → null sin tocar DB', async () => {
    const db = makeDb();
    const ids = await scope.ownedApIntIds(db, { account: { platform_admin: true } });
    expect(ids).toBeNull();
    expect(db.all).not.toHaveBeenCalled();
  });

  it('moderador sin grupos → [] sin segunda query', async () => {
    const db = makeDb({ all: [] });
    const ids = await scope.ownedApIntIds(db, {
      account: { role: 'OWNER', workspace_id: 'ws-y' },
    });
    expect(ids).toEqual([]);
    // Solo la query de ap_groups, no la de aps
    expect(db.all).toHaveBeenCalledTimes(1);
  });

  it('moderador con grupos → APs de esos grupos', async () => {
    const db = {
      all: vi.fn()
        .mockResolvedValueOnce([{ id: 5 }, { id: 9 }])         // ap_groups
        .mockResolvedValueOnce([{ id: 100 }, { id: 200 }, { id: 300 }]), // aps
      get: vi.fn(),
    };
    const ids = await scope.ownedApIntIds(db, {
      account: { role: 'OWNER', workspace_id: 'ws-z' },
    });
    expect(ids).toEqual([100, 200, 300]);
    // 2ª query usa IN con los IDs de grupos
    const [sql, params] = db.all.mock.calls[1];
    expect(sql).toMatch(/FROM aps WHERE ap_group_id IN/);
    expect(params).toEqual([5, 9]);
  });
});

describe('ownsGroupUuid', () => {
  it('platform_admin → true sin tocar DB', async () => {
    const db = makeDb();
    expect(await scope.ownsGroupUuid(db, { account: { platform_admin: true } }, 'uuid-x')).toBe(true);
    expect(db.get).not.toHaveBeenCalled();
  });

  it('moderador: true si workspace_id del grupo matchea', async () => {
    const db = makeDb({ get: { workspace_id: 'ws-42' } });
    const owns = await scope.ownsGroupUuid(db, {
      account: { role: 'OWNER', workspace_id: 'ws-42' },
    }, 'uuid-grp');
    expect(owns).toBe(true);
  });

  it('moderador: false si el grupo es de otro workspace', async () => {
    const db = makeDb({ get: { workspace_id: 'ws-OTRO' } });
    const owns = await scope.ownsGroupUuid(db, {
      account: { role: 'OWNER', workspace_id: 'ws-42' },
    }, 'uuid-grp');
    expect(owns).toBe(false);
  });

  it('moderador: false si el grupo no existe', async () => {
    const db = makeDb({ get: null });
    const owns = await scope.ownsGroupUuid(db, {
      account: { role: 'OWNER', workspace_id: 'ws-42' },
    }, 'uuid-noexiste');
    expect(owns).toBe(false);
  });
});

describe('cpeForeign', () => {
  it('platform_admin → false (no es ajeno)', async () => {
    const db = makeDb();
    expect(await scope.cpeForeign(db, { account: { platform_admin: true } }, 'AA:BB')).toBe(false);
    expect(db.get).not.toHaveBeenCalled();
  });

  it('CPE inexistente → false (no es ajeno)', async () => {
    const db = makeDb({ get: null });
    expect(await scope.cpeForeign(db, {
      account: { role: 'OWNER', workspace_id: 'ws-1' },
    }, 'AA:BB')).toBe(false);
  });

  it('CPE huérfano (ap_id NULL) → false (no es ajeno)', async () => {
    const db = makeDb({ get: { ap_id: null, w: null } });
    expect(await scope.cpeForeign(db, {
      account: { role: 'OWNER', workspace_id: 'ws-1' },
    }, 'AA:BB')).toBe(false);
  });

  it('CPE de OTRO workspace → true (es ajeno)', async () => {
    const db = makeDb({ get: { ap_id: 5, w: 'ws-OTRO' } });
    expect(await scope.cpeForeign(db, {
      account: { role: 'OWNER', workspace_id: 'ws-1' },
    }, 'AA:BB')).toBe(true);
  });

  it('CPE del MISMO workspace → false (no es ajeno)', async () => {
    const db = makeDb({ get: { ap_id: 5, w: 'ws-1' } });
    expect(await scope.cpeForeign(db, {
      account: { role: 'OWNER', workspace_id: 'ws-1' },
    }, 'AA:BB')).toBe(false);
  });
});
