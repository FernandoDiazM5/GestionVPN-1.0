const bcrypt = require('bcryptjs');
const {
  ARGON2_OPTIONS,
  hashPassword,
  verifyPassword,
  needsRehash,
  verifyAndUpgrade,
} = require('../../lib/passwordHasher');

const PASSWORD = 'correct horse battery staple';

describe('passwordHasher', () => {
  it('creates unique Argon2id hashes with the approved baseline parameters', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).toMatch(/^\$argon2id\$/);
    expect(second).not.toBe(first);
    expect(ARGON2_OPTIONS).toMatchObject({ memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 });
    await expect(verifyPassword(PASSWORD, first)).resolves.toBe(true);
    await expect(verifyPassword('incorrect password', first)).resolves.toBe(false);
  });

  it('keeps compatibility with existing bcrypt hashes', async () => {
    const legacyHash = await bcrypt.hash(PASSWORD, 10);
    await expect(verifyPassword(PASSWORD, legacyHash)).resolves.toBe(true);
    expect(needsRehash(legacyHash)).toBe(true);
  });

  it('rejects bcrypt inputs longer than 72 UTF-8 bytes', async () => {
    const legacyHash = await bcrypt.hash('a'.repeat(72), 10);
    await expect(verifyPassword('a'.repeat(73), legacyHash)).resolves.toBe(false);
  });

  it('upgrades bcrypt after a valid login through a conditional callback', async () => {
    const legacyHash = await bcrypt.hash(PASSWORD, 10);
    const updateIfCurrent = vi.fn().mockResolvedValue(true);

    await expect(verifyAndUpgrade(PASSWORD, legacyHash, updateIfCurrent))
      .resolves.toEqual({ valid: true, upgraded: true, dummy: false });
    const [newHash, previousHash] = updateIfCurrent.mock.calls[0];
    expect(newHash).toMatch(/^\$argon2id\$/);
    expect(previousHash).toBe(legacyHash);
  });

  it('upgrades a verified legacy password shorter than the policy for new passwords', async () => {
    const legacyPassword = '12345678';
    const legacyHash = await bcrypt.hash(legacyPassword, 10);
    const updateIfCurrent = vi.fn().mockResolvedValue(true);

    await expect(verifyAndUpgrade(legacyPassword, legacyHash, updateIfCurrent))
      .resolves.toEqual({ valid: true, upgraded: true, dummy: false });
    const [newHash, previousHash] = updateIfCurrent.mock.calls[0];
    expect(newHash).toMatch(/^\$argon2id\$/);
    expect(previousHash).toBe(legacyHash);
    await expect(verifyPassword(legacyPassword, newHash)).resolves.toBe(true);
  });

  it('does not write or rehash when verification fails', async () => {
    const legacyHash = await bcrypt.hash(PASSWORD, 10);
    const updateIfCurrent = vi.fn();
    await expect(verifyAndUpgrade('wrong password', legacyHash, updateIfCurrent))
      .resolves.toEqual({ valid: false, upgraded: false, dummy: false });
    expect(updateIfCurrent).not.toHaveBeenCalled();
  });

  it('pays a dummy Argon2id verification when no stored hash exists', async () => {
    const updateIfCurrent = vi.fn();
    await expect(verifyAndUpgrade(PASSWORD, null, updateIfCurrent))
      .resolves.toEqual({ valid: false, upgraded: false, dummy: true });
    expect(updateIfCurrent).not.toHaveBeenCalled();
  });

  it('enforces the policy only for newly written passwords', async () => {
    await expect(hashPassword('too-short')).rejects.toThrow('12 y 128');
    await expect(hashPassword('x'.repeat(129))).rejects.toThrow('12 y 128');
    await expect(verifyPassword('anything', 'malformed')).resolves.toBe(false);
  });
});
