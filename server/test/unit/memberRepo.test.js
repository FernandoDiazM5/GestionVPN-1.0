const { stubModule } = require('../helpers/moduleMock');

const mysql = stubModule(__dirname, '../../db/mysql', { query: vi.fn() });
const memberRepo = require('../../db/repos/memberRepo');

describe('memberRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excluye administradores de plataforma del listado del equipo', async () => {
    mysql.query.mockResolvedValue([]);

    await memberRepo.listMembers('ws-client');

    expect(mysql.query).toHaveBeenCalledOnce();
    expect(mysql.query.mock.calls[0][0]).toContain('u.is_platform_admin = 0');
    expect(mysql.query.mock.calls[0][1]).toEqual(['ws-client']);
  });

  it('retira el OWNER placeholder al aceptar el propietario real', async () => {
    const tx = { query: vi.fn().mockResolvedValue({ affectedRows: 1 }) };

    const removed = await memberRepo.removePlatformAdminPlaceholders(tx, 'ws-client', 'real-owner');

    expect(removed).toBe(1);
    expect(tx.query).toHaveBeenCalledOnce();
    expect(tx.query.mock.calls[0][0]).toContain('u.is_platform_admin = 1');
    expect(tx.query.mock.calls[0][1].slice(1)).toEqual(['ws-client', 'real-owner']);
  });
});
