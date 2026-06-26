// ============================================================
//  auditRepo — la "Actividad reciente" lee de tunnel_session_logs
//  (donde el sistema multiusuario escribe los eventos reales),
//  NO de la tabla vieja tunnel_logs (que nadie llena → panel vacío).
// ============================================================
const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn().mockResolvedValue([]);
stubModule(__dirname, '../../db/mysql', { query });

const auditRepo = require('../../db/repos/auditRepo');

beforeEach(() => { query.mockClear(); query.mockResolvedValue([]); });

describe('auditRepo.list', () => {
  it('consulta tunnel_session_logs (no tunnel_logs) y mapea message → detail', async () => {
    await auditRepo.list('ws-1', { limit: 50 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM tunnel_session_logs/);
    expect(sql).not.toMatch(/FROM tunnel_logs/);
    expect(sql).toMatch(/message AS detail/);
    expect(sql).toMatch(/sl\.workspace_id = \?/);
    expect(params[0]).toBe('ws-1');
    expect(params).toContain(50);
  });

  it('filtra por tunnelId cuando se pasa', async () => {
    await auditRepo.list('ws-1', { tunnelId: 'VRF-A' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/sl\.tunnel_id = \?/);
    expect(params).toContain('VRF-A');
  });
});

describe('auditRepo.listForExport', () => {
  it('consulta tunnel_session_logs con filtros de rango/acción', async () => {
    await auditRepo.listForExport('ws-1', { from: 1000, to: 2000, action: 'ACTIVATE' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM tunnel_session_logs/);
    expect(sql).toMatch(/sl\.created_at >= \?/);
    expect(sql).toMatch(/sl\.action = \?/);
    expect(params).toContain(1000);
    expect(params).toContain('ACTIVATE');
  });
});
