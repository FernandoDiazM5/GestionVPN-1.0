const { stubModule } = require('../helpers/moduleMock');

const conn = {
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};

stubModule(__dirname, '../../db/mysql', {
  getPool: () => ({ getConnection: vi.fn().mockResolvedValue(conn) }),
});

const { createInitialUser } = require('../../db.service');

describe('atomic initial setup', () => {
  beforeEach(() => {
    for (const method of Object.values(conn)) method.mockReset?.();
    conn.query
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockResolvedValueOnce([[{ released: 1 }]]);
    conn.execute.mockResolvedValue([{ affectedRows: 1 }]);
  });

  it('holds the global lock until the bootstrap user is committed', async () => {
    await expect(createInitialUser('admin', 'hash', 'admin')).resolves.toBe(true);

    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO vpn_users'),
      expect.arrayContaining(['admin', 'hash', 'admin'])
    );
    expect(conn.commit.mock.invocationCallOrder[0])
      .toBeLessThan(conn.query.mock.invocationCallOrder[2]);
    expect(conn.release).toHaveBeenCalledOnce();
  });

  it('does not insert a second administrator after setup is complete', async () => {
    conn.query.mockReset()
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[{ count: 1 }]])
      .mockResolvedValueOnce([[{ released: 1 }]]);

    await expect(createInitialUser('other-admin', 'hash', 'admin')).resolves.toBe(false);
    expect(conn.execute).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
});
