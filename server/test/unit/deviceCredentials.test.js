const { assertPersistableSshCredential } = require('../../lib/deviceCredentials');

describe('credenciales SSH al persistir equipos', () => {
  it('rechaza usuario sin clave en un equipo nuevo', () => {
    expect(() => assertPersistableSshCredential({ sshUser: 'ubnt' }, null))
      .toThrow(expect.objectContaining({
        status: 422,
        code: 'SSH_CREDENTIAL_REQUIRED',
      }));
  });

  it('permite actualizar sin reenviar la clave cifrada existente', () => {
    expect(assertPersistableSshCredential(
      { sshUser: 'ubnt' },
      { usuario_ssh: 'ubnt', clave_ssh_enc: 'cipher' },
    )).toEqual({ hasIncomingPass: false });
  });

  it('trata una contraseña vacía explícita como credencial presente', () => {
    expect(assertPersistableSshCredential(
      { sshUser: 'ubnt', sshPass: '' },
      null,
    )).toEqual({ hasIncomingPass: true });
  });

  it('rechaza una clave sin usuario SSH', () => {
    expect(() => assertPersistableSshCredential({ sshPass: 'secret' }, null))
      .toThrow(expect.objectContaining({
        status: 422,
        code: 'SSH_USER_REQUIRED',
      }));
  });
});
