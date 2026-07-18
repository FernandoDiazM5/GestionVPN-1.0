const { stubModule } = require('../helpers/moduleMock');

const tx = { query: vi.fn() };
const mysqlMocks = stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  withTransaction: vi.fn(async (callback) => callback(tx)),
});

const repo = require('../../db/repos/authRateBucketRepo');

const base = {
  bucketHash: 'a'.repeat(64),
  kind: 'LOGIN_IP',
  limit: 5,
  windowMs: 60_000,
  blockMs: 120_000,
  now: 1_000_000,
};

describe('authRateBucketRepo', () => {
  beforeEach(() => {
    tx.query.mockReset();
    mysqlMocks.query.mockReset();
    mysqlMocks.withTransaction.mockReset().mockImplementation(async (callback) => callback(tx));
  });

  it('serializes an allowed increment with SELECT FOR UPDATE', async () => {
    tx.query
      .mockResolvedValueOnce({ affectedRows: 0 })
      .mockResolvedValueOnce([{ count: 3, window_started_at: 990_000, blocked_until: 0 }])
      .mockResolvedValueOnce({ affectedRows: 1 });

    await expect(repo.consume(base)).resolves.toEqual({
      allowed: true,
      count: 4,
      retryAfterMs: 0,
    });

    expect(tx.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(tx.query.mock.calls[2][1]).toEqual([
      4, 990_000, 0, 1_000_000, base.bucketHash, 'LOGIN_IP',
    ]);
  });

  it('blocks atomically when the next request exceeds the limit', async () => {
    tx.query
      .mockResolvedValueOnce({ affectedRows: 0 })
      .mockResolvedValueOnce([{ count: 5, window_started_at: 990_000, blocked_until: 0 }])
      .mockResolvedValueOnce({ affectedRows: 1 });

    await expect(repo.consume(base)).resolves.toEqual({
      allowed: false,
      count: 6,
      retryAfterMs: 120_000,
    });
    expect(tx.query.mock.calls[2][1][2]).toBe(1_120_000);
  });

  it('preserves an active block without incrementing the counter', async () => {
    tx.query
      .mockResolvedValueOnce({ affectedRows: 0 })
      .mockResolvedValueOnce([{ count: 6, window_started_at: 990_000, blocked_until: 1_030_000 }])
      .mockResolvedValueOnce({ affectedRows: 1 });

    await expect(repo.consume(base)).resolves.toEqual({
      allowed: false,
      count: 6,
      retryAfterMs: 30_000,
    });
    expect(tx.query.mock.calls[2][0]).toContain('SET updated_at');
  });

  it('starts a fresh counter after the window expires', async () => {
    tx.query
      .mockResolvedValueOnce({ affectedRows: 0 })
      .mockResolvedValueOnce([{ count: 99, window_started_at: 900_000, blocked_until: 950_000 }])
      .mockResolvedValueOnce({ affectedRows: 1 });

    await expect(repo.consume(base)).resolves.toMatchObject({ allowed: true, count: 1 });
    expect(tx.query.mock.calls[2][1]).toEqual([
      1, 1_000_000, 0, 1_000_000, base.bucketHash, 'LOGIN_IP',
    ]);
  });

  it('rejects unsafe bucket identifiers before querying MySQL', async () => {
    await expect(repo.consume({ ...base, bucketHash: 'raw-email@example.com' }))
      .rejects.toThrow('bucketHash inválido');
    expect(tx.query).not.toHaveBeenCalled();
  });

  it('allows only the configured limit under 50 concurrent reservations', async () => {
    const state = { count: 0, window_started_at: base.now, blocked_until: 0 };
    let queue = Promise.resolve();

    mysqlMocks.withTransaction.mockImplementation((callback) => {
      const run = queue.then(() => callback({
        query: vi.fn(async (sql, params) => {
          if (sql.includes('INSERT IGNORE')) return { affectedRows: 0 };
          if (sql.includes('FOR UPDATE')) return [{ ...state }];
          if (sql.includes('SET count =')) {
            [state.count, state.window_started_at, state.blocked_until] = params;
            return { affectedRows: 1 };
          }
          if (sql.includes('SET updated_at')) return { affectedRows: 1 };
          throw new Error(`SQL inesperado: ${sql}`);
        }),
      }));
      queue = run.catch(() => {});
      return run;
    });

    const results = await Promise.all(Array.from({ length: 50 }, () => repo.consume(base)));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(45);
    expect(state.count).toBe(6);
  });

  it('purges only stale rows with a bounded delete', async () => {
    mysqlMocks.query.mockResolvedValue({ affectedRows: 7 });
    await expect(repo.purgeStale(500_000, 500)).resolves.toEqual({ affectedRows: 7 });
    expect(mysqlMocks.query).toHaveBeenCalledWith(
      'DELETE FROM auth_rate_buckets WHERE updated_at < ? LIMIT ?',
      [500_000, 500]
    );
  });
});
