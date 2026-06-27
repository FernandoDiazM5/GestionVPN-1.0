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

describe('auditRepo.purgeOlderThan', () => {
  it('borra de ambas tablas con el corte y suma las filas borradas', async () => {
    query.mockResolvedValue({ affectedRows: 3 });
    const removed = await auditRepo.purgeOlderThan(1000);
    const tables = query.mock.calls.map(c => c[0]);
    expect(tables.some(s => /DELETE FROM tunnel_session_logs WHERE created_at < \?/.test(s))).toBe(true);
    expect(tables.some(s => /DELETE FROM tunnel_logs WHERE created_at < \?/.test(s))).toBe(true);
    expect(query.mock.calls.every(c => c[1][0] === 1000)).toBe(true);
    expect(removed).toBe(6); // 3 + 3
  });

  it('best-effort: si una tabla falla, no lanza', async () => {
    query.mockRejectedValue(new Error('tabla ausente'));
    await expect(auditRepo.purgeOlderThan(1000)).resolves.toBe(0);
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
