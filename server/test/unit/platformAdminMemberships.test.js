import { describe, expect, it, vi } from 'vitest';
const { removeForeignPlatformAdminMemberships } = require('../../db/migratePlatformAdminMemberships');

describe('aislamiento de membresías del administrador de plataforma', () => {
  it('retira sólo membresías ajenas y conserva el workspace propio', async () => {
    const runQuery = vi.fn().mockResolvedValue({ affectedRows: 1 });

    await expect(removeForeignPlatformAdminMemberships(runQuery, 1234)).resolves.toBe(1);

    const [sql, params] = runQuery.mock.calls[0];
    expect(sql).toContain('u.is_platform_admin = 1');
    expect(sql).toContain('w.owner_id <> u.id');
    expect(sql).toContain('wm.deleted_at IS NULL');
    expect(params).toEqual([1234]);
  });
});
