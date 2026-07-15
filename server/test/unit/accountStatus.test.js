const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
stubModule(__dirname, '../../db/mysql', { query });

const { getAccountStatus, invalidateAccountStatus } = require('../../lib/accountStatus');

describe('accountStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const id of ['active', 'suspended', 'deleted']) invalidateAccountStatus(id);
  });

  it('distingue cuentas activas, suspendidas y eliminadas', async () => {
    query
      .mockResolvedValueOnce([{ disabled_at: null }])
      .mockResolvedValueOnce([{ disabled_at: 123 }])
      .mockResolvedValueOnce([]);

    await expect(getAccountStatus('active')).resolves.toBe('active');
    await expect(getAccountStatus('suspended')).resolves.toBe('suspended');
    await expect(getAccountStatus('deleted')).resolves.toBe('deleted');
  });

  it('invalida el cache al suspender desde Administracion', async () => {
    query.mockResolvedValueOnce([{ disabled_at: null }]);
    await expect(getAccountStatus('active')).resolves.toBe('active');

    query.mockResolvedValueOnce([{ disabled_at: Date.now() }]);
    invalidateAccountStatus('active');
    await expect(getAccountStatus('active')).resolves.toBe('suspended');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
