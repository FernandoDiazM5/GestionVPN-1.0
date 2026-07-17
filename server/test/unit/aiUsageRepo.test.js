const aiUsageRepo = require('../../db/repos/aiUsageRepo');

function transactionWith(globalUsage, workspaceUsage) {
  const tx = {
    query: vi.fn()
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([globalUsage])
      .mockResolvedValueOnce([workspaceUsage])
      .mockResolvedValueOnce({ affectedRows: 2 }),
  };
  return { tx, transaction: callback => callback(tx) };
}

describe('aiUsageRepo.reserve', () => {
  it('reserva global y workspace en una única transacción', async () => {
    const { tx, transaction } = transactionWith(
      { request_count: 2, total_tokens: 1000 },
      { request_count: 1 }
    );
    await expect(aiUsageRepo.reserve({
      workspaceId: 'ws-1', globalLimit: 20, workspaceLimit: 10, globalTokenLimit: 150000,
    }, transaction)).resolves.toBe(true);
    expect(tx.query).toHaveBeenCalledTimes(5);
    expect(tx.query.mock.calls[4][0]).toContain('request_count = request_count + 1');
  });

  it('no incrementa solicitudes cuando se agotó el presupuesto de tokens', async () => {
    const { tx, transaction } = transactionWith(
      { request_count: 2, total_tokens: 150000 },
      { request_count: 1 }
    );
    await expect(aiUsageRepo.reserve({
      workspaceId: 'ws-1', globalLimit: 20, workspaceLimit: 10, globalTokenLimit: 150000,
    }, transaction)).resolves.toBe(false);
    expect(tx.query).toHaveBeenCalledTimes(4);
  });
});
