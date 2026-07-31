const { stubModule } = require('../helpers/moduleMock');
const mysql = stubModule(__dirname, '../../db/mysql', { query: vi.fn() });
const repo = require('../../db/repos/platformSecurityRepo');

describe('platformSecurityRepo', () => {
  beforeEach(() => mysql.query.mockReset());

  it('consume la reautenticación de forma atómica y de un solo uso', async () => {
    mysql.query.mockResolvedValueOnce({ affectedRows: 1 });
    await expect(repo.consumeStepUp({ tokenHash: 'a'.repeat(64), userId: 'u', sessionJti: 'j' }))
      .resolves.toBe(true);
    expect(mysql.query.mock.calls[0][0]).toContain('DELETE FROM platform_security_stepups');
  });

  it('rechaza un token ausente, vencido o ya consumido', async () => {
    mysql.query.mockResolvedValueOnce({ affectedRows: 0 });
    await expect(repo.consumeStepUp({ tokenHash: 'a'.repeat(64), userId: 'u', sessionJti: 'j' }))
      .resolves.toBe(false);
  });
});
