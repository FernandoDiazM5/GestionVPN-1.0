const { stubModule } = require('../helpers/moduleMock');

const mysql = stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  withTransaction: vi.fn(),
});

const repo = require('../../db/repos/sessionRepo');

beforeEach(() => {
  mysql.query.mockReset();
});

describe('sessionRepo lease', () => {
  it('usa un lease corto configurable con mínimo de seguridad', () => {
    expect(repo.TTL_MS).toBeGreaterThanOrEqual(2 * 60 * 1000);
    expect(repo.TTL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('renueva sólo una sesión ACTIVE que todavía no venció', async () => {
    mysql.query.mockResolvedValueOnce({ affectedRows: 1 });
    const expiresAt = await repo.touch('session-1', 1_000);

    expect(expiresAt).toBe(1_000 + repo.TTL_MS);
    const [sql, params] = mysql.query.mock.calls[0];
    expect(sql).toMatch(/status = 'ACTIVE'/);
    expect(sql).toMatch(/expires_at >= \?/);
    expect(params).toEqual([expiresAt, 'session-1', 1_000]);
  });

  it('no resucita un lease que ya perdió la carrera con expiración', async () => {
    mysql.query.mockResolvedValueOnce({ affectedRows: 0 });
    await expect(repo.touch('session-expired', 2_000)).resolves.toBeNull();
  });
});
