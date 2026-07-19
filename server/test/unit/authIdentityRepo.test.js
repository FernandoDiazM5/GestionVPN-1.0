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
});
