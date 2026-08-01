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

  it('cuenta reincidencias entre todos los jails web temporales autorizados', async () => {
    mysql.query.mockResolvedValue([{ total: 3 }]);
    await expect(repo.countAppliedTemporarySince({ sourceIp: '198.51.100.8',
      jails: ['gestionvpn-web-1h', 'gestionvpn-web-scan-6h'], since: 2000 })).resolves.toBe(3);
    expect(mysql.query.mock.calls[0][1]).toEqual([
      '198.51.100.8', 'gestionvpn-web-1h', 'gestionvpn-web-scan-6h', 2000,
    ]);
  });

  it('cuenta episodios de escaneo por recomendación, no por otros vectores', async () => {
    mysql.query.mockResolvedValue([{ total: 2 }]);
    await expect(repo.countAppliedRecommendationsSince({ sourceIp: '198.51.100.9',
      recommendations: ['ROUTE_SCAN_6H', 'ROUTE_SCAN_24H'], since: 3000 })).resolves.toBe(2);
    expect(mysql.query.mock.calls[0][0]).toContain('recommendation IN (?,?)');
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
