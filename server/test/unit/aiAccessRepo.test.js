const aiAccessRepo = require('../../db/repos/aiAccessRepo');

describe('aiAccessRepo', () => {
  it('la ausencia de fila equivale a acceso deshabilitado', async () => {
    const runQuery = vi.fn().mockResolvedValue([]);
    await expect(aiAccessRepo.getForUser('owner-1', runQuery)).resolves.toEqual({
      enabled: false, enabled_at: null, disabled_at: null, updated_at: null,
    });
  });

  it('no crea permisos para usuarios que no sean OWNER activos', async () => {
    const runQuery = vi.fn().mockResolvedValueOnce([]);
    await expect(aiAccessRepo.setForModerator({
      userId: 'member-1', enabled: true, changedByAdmin: 'admin-1',
    }, runQuery)).resolves.toBeNull();
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runQuery.mock.calls[0][0]).toContain("wm.role = 'OWNER'");
  });

  it('persiste actor y estado para un moderador válido', async () => {
    const runQuery = vi.fn()
      .mockResolvedValueOnce([{ id: 'owner-1', workspace_id: 'ws-1' }])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ enabled: 1, enabled_at: 100, disabled_at: null, updated_at: 100 }]);
    const result = await aiAccessRepo.setForModerator({
      userId: 'owner-1', enabled: true, changedByAdmin: 'admin-1',
    }, runQuery);
    expect(result.enabled).toBe(true);
    expect(runQuery.mock.calls[1][1]).toEqual(expect.arrayContaining(['owner-1', 'ws-1', 1, 'admin-1']));
  });
});
