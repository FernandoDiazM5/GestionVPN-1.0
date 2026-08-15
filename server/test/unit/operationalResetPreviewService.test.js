const { loadOperationalResetPreview } = require('../../lib/operationalResetPreviewService');

function queryStub(values) {
  let index = 0;
  return vi.fn().mockImplementation(async () => [{ total: values[index++] || 0 }]);
}

describe('operationalResetPreviewService', () => {
  it('declara limpio sólo sin datos operativos ni ambiguos', async () => {
    const values = Array(21).fill(0);
    values[18] = 1; // platform admin
    const preview = await loadOperationalResetPreview(queryStub(values));
    expect(preview).toMatchObject({ readOnly: true, clean: true, canExecuteReset: false });
    expect(preview.blockers).toEqual([]);
  });

  it('separa datos operativos, ambiguos y administrativos', async () => {
    const values = Array(21).fill(0);
    values[0] = 2;  // nodes
    values[14] = 1; // orphan towers
    values[16] = 3; // workspaces
    values[17] = 4; // non-admin users
    values[18] = 1; // platform admin
    values[19] = 8; // settings
    values[20] = 9; // audit
    const preview = await loadOperationalResetPreview(queryStub(values));
    expect(preview.clean).toBe(false);
    expect(preview.operational.nodes).toBe(2);
    expect(preview.ambiguousTotal).toBe(1);
    expect(preview.preserved).toEqual({ platformAdmins: 1, administrationSettings: 8, auditRecords: 9 });
    expect(preview.blockers).toHaveLength(2);
  });
});
