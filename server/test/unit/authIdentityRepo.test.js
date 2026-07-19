const { stubModule } = require('../helpers/moduleMock');

const mysqlMocks = stubModule(__dirname, '../../db/mysql', { query: vi.fn() });
const repo = require('../../db/repos/authIdentityRepo');

beforeEach(() => mysqlMocks.query.mockReset());

describe('authIdentityRepo', () => {
  it('busca por subject parametrizado y exige RBAC local activo', async () => {
    mysqlMocks.query.mockResolvedValue([{ user_id: 'user-1' }]);
    await expect(repo.findLoginContext({
      provider: 'firebase', tenantKey: '', subject: 'uid-1',
    })).resolves.toEqual({ user_id: 'user-1' });

    const [sql, params] = mysqlMocks.query.mock.calls[0];
    expect(sql).toContain('JOIN users');
    expect(sql).toContain('JOIN workspace_members');
    expect(sql).toContain('JOIN workspaces');
    expect(sql).toContain('ai.disabled_at IS NULL');
    expect(sql).not.toContain('uid-1');
    expect(params).toEqual(['firebase', '', 'uid-1']);
  });

  it('vincula sin persistir token ni contraseña', async () => {
    mysqlMocks.query.mockResolvedValue({ affectedRows: 1 });
    await repo.link({
      userId: 'user-1',
      provider: 'firebase',
      tenantKey: '',
      subject: 'uid-1',
      emailAtLink: 'user@example.com',
    });
    const [sql, params] = mysqlMocks.query.mock.calls[0];
    expect(sql).not.toMatch(/password|token|secret/i);
    expect(params).toContain('uid-1');
    expect(params).toContain('user@example.com');
  });

  it('no marca como verificado un mapping deshabilitado', async () => {
    mysqlMocks.query.mockResolvedValue({ affectedRows: 0 });
    await expect(repo.markVerified({
      provider: 'firebase', tenantKey: '', subject: 'uid-1',
    })).resolves.toBe(false);
    expect(mysqlMocks.query.mock.calls[0][0]).toContain('disabled_at IS NULL');
  });

  it('deshabilita o reactiva el mapping sin borrarlo', async () => {
    mysqlMocks.query.mockResolvedValue({ affectedRows: 1 });
    await expect(repo.setDisabled({ id: 'identity-1', disabledAt: 1234 })).resolves.toBe(true);
    const [sql, params] = mysqlMocks.query.mock.calls[0];
    expect(sql).toContain('SET disabled_at = ?');
    expect(params[0]).toBe(1234);
    expect(params.at(-1)).toBe('identity-1');

    mysqlMocks.query.mockClear();
    await expect(repo.reactivate({
      id: 'identity-1', emailAtLink: 'new@example.com',
    })).resolves.toBe(true);
    const [reactivateSql, reactivateParams] = mysqlMocks.query.mock.calls[0];
    expect(reactivateSql).toContain('disabled_at = NULL');
    expect(reactivateParams).toContain('new@example.com');
  });
});
