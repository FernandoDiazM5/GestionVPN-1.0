import { describe, expect, it } from 'vitest';
const migration = require('../../db/migrateMikrowispTelegram');

describe('migrateMikrowispTelegram', () => {
  it('extrae sólo las tablas operativas declaradas y adapta la collation del entorno', () => {
    const raw = migration.TABLES.map(name => `CREATE TABLE IF NOT EXISTS ${name} (id CHAR(36)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`).join('\n');
    const statements = migration.adaptSchema(raw, 'utf8mb4_uca1400_ai_ci');
    expect(statements).toHaveLength(migration.TABLES.length);
    expect(statements.every(sql => sql.includes('COLLATE=utf8mb4_uca1400_ai_ci'))).toBe(true);
  });

  it('rechaza una collation que pueda inyectar SQL', () => {
    expect(() => migration.adaptSchema('', 'utf8mb4_unicode_ci; DROP TABLE users')).toThrow('Collation MySQL inválida');
  });
});
