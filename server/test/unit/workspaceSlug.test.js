const {
  slugifyWorkspaceName,
  allocateWorkspaceSlug,
} = require('../../lib/workspaceSlug');

describe('workspaceSlug', () => {
  it('normaliza espacios, tildes y símbolos', () => {
    expect(slugifyWorkspaceName('  Gestión Ñandú / Lima  ')).toBe('gestion-nandu-lima');
  });

  it('usa un fallback cuando el nombre no contiene caracteres URL seguros', () => {
    expect(slugifyWorkspaceName('---')).toBe('workspace');
  });

  it('conserva el nombre limpio cuando está disponible', async () => {
    const query = async () => [];
    await expect(allocateWorkspaceSlug(query, {
      name: 'Housenet',
      workspaceId: '12345678-abcd',
    })).resolves.toBe('housenet');
  });

  it('añade una porción estable del id si el nombre ya está ocupado', async () => {
    const query = async (_sql, [candidate]) => candidate === 'housenet' ? [{ id: 'other' }] : [];
    await expect(allocateWorkspaceSlug(query, {
      name: 'Housenet',
      workspaceId: '12345678-abcd',
    })).resolves.toBe('housenet-123456');
  });
});
