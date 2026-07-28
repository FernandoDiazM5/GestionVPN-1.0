const { encryptPass, decryptPass } = require('../../db.service');

describe('cifrado de secretos', () => {
  it('distingue una contraseña vacía explícita de una contraseña ausente', () => {
    const encryptedEmpty = encryptPass('');

    expect(encryptedEmpty).toBeTruthy();
    expect(decryptPass(encryptedEmpty)).toBe('');
    expect(encryptPass(undefined)).toBeNull();
    expect(encryptPass(null)).toBeNull();
  });
});
