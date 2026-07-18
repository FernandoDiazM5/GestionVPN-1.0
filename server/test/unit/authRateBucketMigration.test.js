const { CREATE_TABLE_SQL } = require('../../db/migrateAuthRateBuckets');

describe('auth rate bucket migration', () => {
  it('defines a persistent atomic bucket without raw identity columns', () => {
    expect(CREATE_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS auth_rate_buckets');
    expect(CREATE_TABLE_SQL).toContain('PRIMARY KEY (bucket_hash, kind)');
    expect(CREATE_TABLE_SQL).toContain('KEY idx_arb_updated (updated_at)');
    expect(CREATE_TABLE_SQL).not.toMatch(/\bemail\b|\bpassword\b|ip_address/i);
  });
});
