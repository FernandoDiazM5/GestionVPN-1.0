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

  it('fija el acceso Telegram en 15 minutos por usuario', () => {
    expect(repo.TELEGRAM_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('guarda Telegram como lease fijo y separado por usuario', async () => {
    const tx = { query: vi.fn().mockResolvedValue({ affectedRows: 1 }) };
    mysql.withTransaction.mockImplementationOnce(async callback => callback(tx));
    const before = Date.now();
    const created = await repo.createSession({ workspaceId: 'ws1', userId: 'u1', tunnelId: 't1', vrfName: 'VRF-1', mgmtIp: '10.0.0.1', leaseSource: 'TELEGRAM' });
    expect(created.expires_at).toBeGreaterThanOrEqual(before + repo.TELEGRAM_TTL_MS);
    expect(created.expires_at).toBeLessThanOrEqual(Date.now() + repo.TELEGRAM_TTL_MS);
    expect(tx.query.mock.calls[0][1].slice(1)).toEqual(['ws1', 'u1']);
    expect(tx.query.mock.calls[1][1].at(-1)).toBe('TELEGRAM');
  });

  it('renueva sólo una sesión ACTIVE que todavía no venció', async () => {
    mysql.query.mockResolvedValueOnce({ affectedRows: 1 });
    const expiresAt = await repo.touch('session-1', 1_000);

    expect(expiresAt).toBe(1_000 + repo.TTL_MS);
    const [sql, params] = mysql.query.mock.calls[0];
    expect(sql).toMatch(/status = 'ACTIVE'/);
    expect(sql).toMatch(/expires_at >= \?/);
    expect(sql).toMatch(/lease_source <> 'TELEGRAM'/);
    expect(params).toEqual([expiresAt, 'session-1', 1_000]);
  });

  it('no resucita un lease que ya perdió la carrera con expiración', async () => {
    mysql.query.mockResolvedValueOnce({ affectedRows: 0 });
    await expect(repo.touch('session-expired', 2_000)).resolves.toBeNull();
  });
});
