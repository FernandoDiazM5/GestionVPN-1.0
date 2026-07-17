const aiAnalysisRepo = require('../../db/repos/aiAnalysisRepo');

describe('aiAnalysisRepo', () => {
  it('filtra el historial individual por huella y ventana de retención', async () => {
    let captured;
    const rows = await aiAnalysisRepo.listForUser({
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'DEVICE',
      deviceFingerprint: 'fingerprint-1',
      createdAfter: 12345,
      limit: 30,
    }, async (sql, params) => {
      captured = { sql, params };
      return [{
        uuid: 'run-1', analysis_type: 'DEVICE', status: 'SUCCEEDED',
        summary_json: JSON.stringify({ summary: 'ok' }), model: 'gemini-test',
        total_tokens: 12, created_at: 23456,
      }];
    });

    expect(captured.sql).toContain("JSON_EXTRACT(r.scope_json, '$.deviceId')");
    expect(captured.sql).toContain('ai_air_os_snapshots');
    expect(captured.sql).toContain('r.created_at >= ?');
    expect(captured.params).toEqual([
      'ws-1', 'user-1', 'DEVICE', 'fingerprint-1', 'fingerprint-1', 12345, 30,
    ]);
    expect(rows[0]).toMatchObject({ uuid: 'run-1', type: 'DEVICE', totalTokens: 12 });
  });
});
