const { loadAdminSummary } = require('../../routes/admin.routes');

describe('admin summary', () => {
  it('excluye al administrador de plataforma de las metricas de clientes', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ moderadores: 0, miembros: 0, total: 1 }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await loadAdminSummary(query, 100_000_000);

    expect(result.summary).toEqual({
      workspaces: 0,
      usuarios: 0,
      moderadores: 0,
      miembros: 0,
      acciones_24h: 0,
    });
    expect(query.mock.calls[0][0]).toContain('u.is_platform_admin=0');
    expect(query.mock.calls[1][0]).toContain('owner.is_platform_admin = 0');
    expect(query.mock.calls[2][0]).toContain('is_platform_admin = 0');
  });
});
