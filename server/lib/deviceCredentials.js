const { AppError } = require('./apiResponse');

function assertPersistableSshCredential(device, existing) {
  const hasIncomingPass = device.sshPass !== undefined;
  if (device.sshUser && !hasIncomingPass && !existing?.clave_ssh_enc) {
    throw new AppError(
      'La clave SSH debe confirmarse antes de guardar el equipo',
      422,
      'SSH_CREDENTIAL_REQUIRED'
    );
  }
  if (hasIncomingPass && !device.sshUser && !existing?.usuario_ssh) {
    throw new AppError(
      'El usuario SSH es requerido cuando se proporciona una clave',
      422,
      'SSH_USER_REQUIRED'
    );
  }
  return { hasIncomingPass };
}

module.exports = { assertPersistableSshCredential };
