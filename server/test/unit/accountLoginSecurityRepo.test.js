const { stubModule } = require('../helpers/moduleMock');

const mysql = stubModule(__dirname, '../../db/mysql', { query: vi.fn(), withTransaction: vi.fn() });
const repo = require('../../db/repos/accountLoginSecurityRepo');

describe('accountLoginSecurityRepo', () => {
  beforeEach(() => vi.clearAllMocks());

  function transactionWith(row) {
    const tx = { query: vi.fn()
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce({ affectedRows: 1 }) };
    mysql.withTransaction.mockImplementation(async callback => callback(tx));
    return tx;
  }

  it('bloquea 15 minutos al quinto fallo real dentro de 15 minutos', async () => {
    const now = 2_000_000;
    const tx = transactionWith({ failures_15m: 4, window_15m_started_at: now - 60_000,
      failures_24h: 4, window_24h_started_at: now - 60_000, locked_until: null });
    const result = await repo.recordFailure({ userId: 'user-1', ip: '203.0.113.8', now });
    expect(result).toMatchObject({ locked: true, failures15m: 5, failures24h: 5,
      lockReason: '5_FAILED_PASSWORDS_15M' });
    expect(result.lockedUntil).toBe(now + 15 * 60 * 1000);
    expect(tx.query.mock.calls[2][1]).toContain(now);
    expect(tx.query).toHaveBeenCalledTimes(3);
  });

  it('eleva el bloqueo a 24 horas al decimo fallo del dia', async () => {
    const now = 5_000_000;
    transactionWith({ failures_15m: 1, window_15m_started_at: now - 60_000,
      failures_24h: 9, window_24h_started_at: now - 3_600_000, locked_until: null });
    const result = await repo.recordFailure({ userId: 'user-1', ip: '203.0.113.8', now });
    expect(result).toMatchObject({ locked: true, failures24h: 10,
      lockReason: '10_FAILED_PASSWORDS_24H' });
    expect(result.lockedUntil).toBe(now + 24 * 60 * 60 * 1000);
  });

  it('el desbloqueo limpia tambien contadores previos al bloqueo', async () => {
    mysql.query.mockResolvedValue({ affectedRows: 1 });
    await expect(repo.unlock('user-1')).resolves.toBe(true);
    expect(mysql.query.mock.calls[0][0]).toContain('failures_15m=0');
    expect(mysql.query.mock.calls[0][0]).toContain('locked_at=NULL');
  });

  it('lista la IP reciente y el inicio real del bloqueo', async () => {
    mysql.query.mockResolvedValue([]);
    await repo.listLocked(10_000);
    expect(mysql.query.mock.calls[0][0]).toContain('s.locked_at');
    expect(mysql.query.mock.calls[0][0]).toContain('s.last_failure_ip');
  });
});
