const { ensureCascade, ensureSiteCleanupTriggers } = require('../../db/migrateSiteEquipmentCascade');

describe('migrateSiteEquipmentCascade', () => {
  it('no altera una relación que ya usa CASCADE', async () => {
    const conn = { execute: vi.fn().mockResolvedValue([[{ CONSTRAINT_NAME: 'fk_ap_node', DELETE_RULE: 'CASCADE' }]]), query: vi.fn() };
    await expect(ensureCascade(conn, 'vpn_manager', { table: 'aps', column: 'node_id', parent: 'nodes', constraint: 'fk_ap_node' })).resolves.toBe(false);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('reemplaza SET NULL por CASCADE', async () => {
    const conn = { execute: vi.fn().mockResolvedValue([[{ CONSTRAINT_NAME: 'fk_ap_node', DELETE_RULE: 'SET NULL' }]]), query: vi.fn().mockResolvedValue([]) };
    await expect(ensureCascade(conn, 'vpn_manager', { table: 'aps', column: 'node_id', parent: 'nodes', constraint: 'fk_ap_node' })).resolves.toBe(true);
    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(conn.query.mock.calls[1][0]).toContain('ON DELETE CASCADE');
  });

  it('instala limpieza de asignaciones, monitoreo, invitaciones y grupos', async () => {
    const conn = { query: vi.fn().mockResolvedValue([]) };
    await ensureSiteCleanupTriggers(conn);
    const sql = conn.query.mock.calls.map(call => call[0]).join('\n');
    expect(sql).toContain('DELETE FROM tunnel_assignments');
    expect(sql).toContain('DELETE FROM monitoring_state');
    expect(sql).toContain("status='REVOKED'");
    expect(sql).toContain('DELETE g FROM ap_groups');
  });
});
