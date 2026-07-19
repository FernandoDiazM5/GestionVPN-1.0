const { CREATE_TABLE_SQL, REQUIRED_COLUMNS } = require('../../db/migrateAuthIdentities');

describe('auth identity migration', () => {
  it('mantiene el mapping normalizado y sin secretos', () => {
    expect(CREATE_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS auth_identities');
    expect(CREATE_TABLE_SQL).toContain('UNIQUE KEY uq_auth_identity_subject');
    expect(CREATE_TABLE_SQL).toContain('UNIQUE KEY uq_auth_identity_user');
    expect(CREATE_TABLE_SQL).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE');
    expect(CREATE_TABLE_SQL).toContain('disabled_at');
    expect(REQUIRED_COLUMNS.disabled_at).toContain('ADD COLUMN disabled_at');
    expect(CREATE_TABLE_SQL).not.toMatch(/password|token|secret/i);
  });
});
