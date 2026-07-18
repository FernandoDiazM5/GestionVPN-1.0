const { CREATE_TABLE_SQL } = require('../../db/migrateAuthSessions');

describe('auth session migration', () => {
  it('define jti revocable, expiración e índices sin almacenar el JWT', () => {
    expect(CREATE_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS auth_sessions');
    expect(CREATE_TABLE_SQL).toContain('PRIMARY KEY (jti)');
    expect(CREATE_TABLE_SQL).toContain('revoked_at');
    expect(CREATE_TABLE_SQL).toContain('idx_auth_sessions_user');
    expect(CREATE_TABLE_SQL).not.toMatch(/token|password|secret/i);
  });
});
