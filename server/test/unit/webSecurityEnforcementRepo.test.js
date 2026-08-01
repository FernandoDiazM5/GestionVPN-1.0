const { stubModule } = require('../helpers/moduleMock');

const mysql = stubModule(__dirname, '../../db/mysql', { query: vi.fn() });
const repo = require('../../db/repos/webSecurityEnforcementRepo');

describe('persistencia de aplicación web', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cuenta únicamente acciones aplicadas del jail y periodo solicitados', async () => {
    mysql.query.mockResolvedValue([{ total: 2 }]);
    await expect(repo.countAppliedSince({ sourceIp: '198.51.100.7',
      jail: 'gestionvpn-web-1h', since: 1234 })).resolves.toBe(2);
    expect(mysql.query).toHaveBeenCalledWith(expect.stringContaining("status='APPLIED'"),
      ['198.51.100.7', 'gestionvpn-web-1h', 1234]);
  });

  it('convierte una clave duplicada en una reclamación idempotente omitida', async () => {
    mysql.query.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }));
    await expect(repo.claim({ idempotencyKey: 'a'.repeat(64), sourceIp: '198.51.100.7',
      recommendation: 'TEMP_1H_ROUTE_SCAN', jail: 'gestionvpn-web-1h' })).resolves.toBeNull();
  });

  it('detecta si el episodio temporal anterior todavía está vigente', async () => {
    mysql.query.mockResolvedValue([{ active: 1 }]);
    await expect(repo.hasActiveTemporary({ sourceIp: '198.51.100.7',
      jail: 'gestionvpn-web-1h', now: 5000 })).resolves.toBe(true);
    expect(mysql.query).toHaveBeenCalledWith(expect.stringContaining('expires_at>?'),
      ['198.51.100.7', 'gestionvpn-web-1h', 5000]);
  });
});
