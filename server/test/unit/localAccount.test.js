// ============================================================
//  localAccount.test.js — cuentas locales (username sin correo real).
//  Cubre: helpers de email sintético, usernames reservados y el
//  contrato CreateModeratorRequestSchema (XOR email/username).
// ============================================================
const { syntheticEmail, isSyntheticEmail, isReservedUsername } = require('../../lib/localAccount');
const { CreateModeratorRequestSchema, UsernameSchema } = require('@gestionvpn/contracts');

describe('localAccount — helpers de email sintético', () => {
  it('syntheticEmail arma <username>@local.app normalizado', () => {
    expect(syntheticEmail('pepe')).toBe('pepe@local.app');
    expect(syntheticEmail('  PePe  ')).toBe('pepe@local.app');
  });

  it('isSyntheticEmail detecta el dominio local (case-insensitive)', () => {
    expect(isSyntheticEmail('pepe@local.app')).toBe(true);
    expect(isSyntheticEmail('PEPE@LOCAL.APP')).toBe(true);
    expect(isSyntheticEmail('pepe@gmail.com')).toBe(false);
    expect(isSyntheticEmail('')).toBe(false);
    expect(isSyntheticEmail(null)).toBe(false);
    expect(isSyntheticEmail(undefined)).toBe(false);
  });

  it('usernames reservados de la plataforma', () => {
    expect(isReservedUsername('admin')).toBe(true);
    expect(isReservedUsername('  ADMIN ')).toBe(true);
    expect(isReservedUsername('root')).toBe(true);
    expect(isReservedUsername('system')).toBe(true);
    expect(isReservedUsername('pepe')).toBe(false);
  });
});

describe('UsernameSchema — formato del username', () => {
  it('acepta formatos válidos y normaliza a minúsculas', () => {
    expect(UsernameSchema.parse('soporte1')).toBe('soporte1');
    expect(UsernameSchema.parse('  Soporte1 ')).toBe('soporte1');
    expect(UsernameSchema.parse('juan.perez_2-a')).toBe('juan.perez_2-a');
  });

  it('rechaza formatos inválidos', () => {
    for (const bad of ['ab', 'a'.repeat(33), 'pepe@local', '.pepe', 'pepe.', '-pepe', 'pe pe', 'ñandú']) {
      expect(() => UsernameSchema.parse(bad)).toThrow();
    }
  });
});

describe('CreateModeratorRequestSchema — XOR email/username', () => {
  const base = { password: 'secreta123' };

  it('acepta email solo', () => {
    const d = CreateModeratorRequestSchema.parse({ ...base, email: 'x@y.com' });
    expect(d.email).toBe('x@y.com');
    expect(d.username).toBeUndefined();
  });

  it('acepta username solo', () => {
    const d = CreateModeratorRequestSchema.parse({ ...base, username: 'pepe' });
    expect(d.username).toBe('pepe');
    expect(d.email).toBeUndefined();
  });

  it('rechaza ambos y ninguno', () => {
    expect(() => CreateModeratorRequestSchema.parse({ ...base, email: 'x@y.com', username: 'pepe' })).toThrow();
    expect(() => CreateModeratorRequestSchema.parse(base)).toThrow();
  });

  it('sigue exigiendo password de 8+', () => {
    expect(() => CreateModeratorRequestSchema.parse({ username: 'pepe', password: 'corta' })).toThrow();
  });
});
