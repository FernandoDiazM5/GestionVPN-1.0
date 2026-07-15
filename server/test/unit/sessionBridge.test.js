const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
const withTransaction = vi.fn();
const findByEmail = vi.fn();
const findMembershipByUser = vi.fn();
const createForOwner = vi.fn();
const signSession = vi.fn(() => 'signed-token');

stubModule(__dirname, '../../db/mysql', { query, withTransaction });
stubModule(__dirname, '../../db/repos/userRepo', { findByEmail });
stubModule(__dirname, '../../db/repos/workspaceRepo', { findMembershipByUser, createForOwner });
stubModule(__dirname, '../../lib/jwt', { signSession });

const { buildSessionForLegacyUser } = require('../../lib/sessionBridge');

describe('sessionBridge', () => {
  it('reutiliza el platform admin si cambio su email', async () => {
    findByEmail.mockResolvedValue(null);
    query.mockResolvedValueOnce([{
      id: 'admin-id', email: 'recuperacion@example.com', name: 'admin', is_platform_admin: 1,
    }]);
    findMembershipByUser.mockResolvedValue({
      workspace_id: 'ws-admin', workspace_name: 'Espacio interno', role: 'OWNER',
    });

    const result = await buildSessionForLegacyUser('admin');

    expect(result.user.email).toBe('recuperacion@example.com');
    expect(withTransaction).not.toHaveBeenCalled();
    expect(signSession).toHaveBeenCalledWith(expect.objectContaining({
      sub: 'admin-id', email: 'recuperacion@example.com', platform_admin: true,
    }));
  });
});
