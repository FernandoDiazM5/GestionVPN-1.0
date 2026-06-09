// ============================================================
//  test/unit/passwordResetRepo.test.js — token de recuperación
//
//  Estrategia: vi.mock('../../db/mysql', factory) define un query()
//  que es un vi.fn() ANTES de cargar el repo. El repo destructura
//  `const { query } = require('../mysql')` → captura el mock.
//
//  Importante:
//    - NO `require('vitest')`: vi está global (vitest.config: globals=true)
//    - vi.mock se hoistea al top, así que el require del repo después
//      ya ve el mock.
// ============================================================
// Stub db/mysql ANTES del primer require al repo. Cualquier require de
// '../mysql' / '../../db/mysql' / etc desde cualquier archivo recibirá
// el mismo objeto mockeado (Node cachea por resolved path absoluto).
const { stubModule } = require('../helpers/moduleMock');
const mocks = stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
  withTransaction: vi.fn(),
});

const repo = require('../../db/repos/passwordResetRepo');
const bcrypt = require('bcryptjs');

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockResolvedValue([]);
});

describe('passwordResetRepo.generateToken', () => {
  it('produce token de 64 chars hex y un hash bcrypt verificable', async () => {
    const { token, hash } = await repo.generateToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(token, hash)).toBe(true);
  });

  it('cada llamada produce un token distinto', async () => {
    const a = await repo.generateToken();
    const b = await repo.generateToken();
    expect(a.token).not.toBe(b.token);
  });
});

describe('passwordResetRepo.create', () => {
  it('inserta con TTL 15 min y devuelve { id, expiresAt }', async () => {
    const before = Date.now();
    const r = await repo.create({ userId: 'u1', tokenHash: 'hash', ipAddress: '1.2.3.4' });
    const after = Date.now();

    expect(r.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(r.expiresAt).toBeGreaterThanOrEqual(before + repo.TTL_MS);
    expect(r.expiresAt).toBeLessThanOrEqual(after + repo.TTL_MS);

    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO password_resets/i);
    expect(params).toEqual([
      r.id, 'u1', 'hash',
      expect.any(Number),  // expires_at
      '1.2.3.4',
      expect.any(Number),  // created_at
    ]);
  });

  it('TTL es exactamente 15 minutos', () => {
    expect(repo.TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe('passwordResetRepo.findValid', () => {
  it('devuelve null si no hay tokens vigentes', async () => {
    const found = await repo.findValid('cualquier-token');
    expect(found).toBeNull();
  });

  it('devuelve { id, userId } cuando el token matchea el hash', async () => {
    const realToken = 'token-en-claro-de-test';
    const hash = await bcrypt.hash(realToken, 10);
    mocks.query.mockResolvedValueOnce([
      { id: 'pr-1', user_id: 'u-42', token_hash: hash },
    ]);
    const found = await repo.findValid(realToken);
    expect(found).toEqual({ id: 'pr-1', userId: 'u-42' });
  });

  it('devuelve null si el token no matchea ningún hash', async () => {
    const otroHash = await bcrypt.hash('otro-token', 10);
    mocks.query.mockResolvedValueOnce([
      { id: 'pr-1', user_id: 'u-42', token_hash: otroHash },
    ]);
    const found = await repo.findValid('token-incorrecto');
    expect(found).toBeNull();
  });

  it('query filtra por used_at IS NULL y expires_at > now (anti-replay/expirados)', async () => {
    await repo.findValid('x');
    const [sql] = mocks.query.mock.calls[0];
    expect(sql).toMatch(/used_at IS NULL/);
    expect(sql).toMatch(/expires_at > \?/);
  });
});

describe('passwordResetRepo.markUsed', () => {
  it('UPDATE password_resets SET used_at = ? WHERE id = ?', async () => {
    await repo.markUsed('pr-1');
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE password_resets SET used_at = \?/);
    expect(params[0]).toBeGreaterThan(0); // timestamp
    expect(params[1]).toBe('pr-1');
  });
});

describe('passwordResetRepo.invalidateForUser', () => {
  it('invalida TODOS los tokens vigentes de un user (used_at IS NULL)', async () => {
    await repo.invalidateForUser('u-42');
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE password_resets SET used_at/);
    expect(sql).toMatch(/WHERE user_id = \? AND used_at IS NULL/);
    expect(params[1]).toBe('u-42');
  });
});

describe('passwordResetRepo.countRecent', () => {
  it('cuenta tokens emitidos dentro de la ventana', async () => {
    mocks.query.mockResolvedValueOnce([{ n: 4 }]);
    const n = await repo.countRecent('u-1', 60 * 60 * 1000);
    expect(n).toBe(4);
  });

  it('devuelve 0 si no hay filas', async () => {
    expect(await repo.countRecent('u-1', 60_000)).toBe(0);
  });
});
