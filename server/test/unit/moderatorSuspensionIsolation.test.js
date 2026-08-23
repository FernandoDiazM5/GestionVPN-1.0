import { describe, expect, it } from 'vitest';
const fs = require('fs');
const path = require('path');

describe('aislamiento al suspender un moderador', () => {
  it('excluye administradores tanto del estado como de la revocación de sesiones', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../routes/admin.routes.js'), 'utf8');
    const suspension = source.slice(source.indexOf('if (disabled) {'), source.indexOf('// 2) Recolectar peers'));
    const sessionTargets = source.slice(source.indexOf('const memberIds ='), source.indexOf('// Borrar mangle activo'));

    expect(suspension).toContain('u.is_platform_admin = 0');
    expect(suspension).toContain('wm.deleted_at IS NULL');
    expect(sessionTargets).toContain('u.is_platform_admin = 0');
    expect(sessionTargets).toContain('wm.deleted_at IS NULL');
  });
});
