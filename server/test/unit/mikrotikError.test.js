// ============================================================
//  mikrotikError.test.js — clasificación de errores de RouterOS:
//  router inalcanzable (timeout/refused/host) → 503 MIKROTIK_UNREACHABLE;
//  cualquier otro error de router → 500 MIKROTIK_ERROR.
// ============================================================
const { isUnreachable } = require('../../routeros.service');
const { mikrotikAppError } = require('../../lib/mikrotikError');
const { AppError } = require('../../lib/apiResponse');

describe('isUnreachable', () => {
  it('detecta timeout / refused / host inalcanzable', () => {
    expect(isUnreachable({ errno: 'SOCKTMOUT', message: 'Timed out after 8 seconds' })).toBe(true);
    expect(isUnreachable({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isUnreachable({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isUnreachable({ code: 'EHOSTUNREACH' })).toBe(true);
    expect(isUnreachable({ message: 'Sin respuesta del router (timeout)' })).toBe(true);
  });

  it('NO marca errores de lógica/credenciales', () => {
    expect(isUnreachable({ errno: 'CANTLOGIN', message: 'cannot log in' })).toBe(false);
    expect(isUnreachable({ message: 'already have such entry' })).toBe(false);
    expect(isUnreachable({})).toBe(false);
  });
});

describe('mikrotikAppError', () => {
  it('inalcanzable → AppError 503 MIKROTIK_UNREACHABLE', () => {
    const e = mikrotikAppError({ errno: 'SOCKTMOUT', message: 'Timed out after 8 seconds' }, '192.168.21.1', 'admin');
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(503);
    expect(e.code).toBe('MIKROTIK_UNREACHABLE');
  });

  it('otro error de router → AppError 500 MIKROTIK_ERROR', () => {
    const e = mikrotikAppError({ message: 'boom' }, '192.168.21.1', 'admin');
    expect(e.status).toBe(500);
    expect(e.code).toBe('MIKROTIK_ERROR');
  });

  it('un AppError existente se devuelve tal cual', () => {
    const orig = new AppError('ya validado', 400, 'VALIDATION_ERROR');
    expect(mikrotikAppError(orig, 'x', 'y')).toBe(orig);
  });
});
