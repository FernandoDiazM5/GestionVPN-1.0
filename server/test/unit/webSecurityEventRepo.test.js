const { stubModule } = require('../helpers/moduleMock');

const mysql = stubModule(__dirname, '../../db/mysql', { query: vi.fn() });
const repo = require('../../db/repos/webSecurityEventRepo');

describe('persistencia de incidentes web', () => {
  beforeEach(() => vi.clearAllMocks());

  it('guarda estado inicial de decisión y sólo evidencia resumida', async () => {
    mysql.query.mockResolvedValue({ affectedRows: 1 });
    await repo.record({ eventType: 'FORBIDDEN', sourceIp: '198.51.100.7', userId: 'user-1',
      routeGroup: '/api/admin', method: 'GET', statusCode: 403,
      detail: { classification: 'INSUFFICIENT_PERMISSION' }, occurredAt: 1000 });
    expect(mysql.query).toHaveBeenCalledWith(expect.stringContaining('decision,occurred_at'),
      expect.arrayContaining(['FORBIDDEN', '198.51.100.7', 'OBSERVE_ONLY', 1000]));
    expect(JSON.stringify(mysql.query.mock.calls[0][1])).not.toContain('password');
  });

  it('vincula los eventos de la ventana con la acción automática', async () => {
    mysql.query.mockResolvedValue({ affectedRows: 4 });
    await expect(repo.markDecision({ sourceIp: '198.51.100.7', eventType: 'RATE_LIMITED',
      since: 2000, decision: 'TEMPORARY_BAN_APPLIED', actionId: 'action-1', decidedAt: 3000 }))
      .resolves.toBe(4);
    expect(mysql.query).toHaveBeenCalledWith(expect.stringContaining('SET decision=?,action_id=?,decided_at=?'),
      ['TEMPORARY_BAN_APPLIED', 'action-1', 3000, '198.51.100.7', 'RATE_LIMITED', 2000]);
  });
});
