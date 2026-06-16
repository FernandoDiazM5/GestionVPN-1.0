// ============================================================
//  mikrotikError.js — traduce un error de RouterOS a AppError con el
//  código/estado correcto para la capa HTTP.
//
//   • Router inalcanzable (timeout/refused/host) → 503 MIKROTIK_UNREACHABLE
//     (el frontend muestra la pantalla "router de gestión no disponible").
//   • Cualquier otro error de router                → 500 MIKROTIK_ERROR.
//
//  Si ya es un AppError (validación, 404, etc.) se devuelve tal cual.
// ============================================================
const { AppError } = require('./apiResponse');
const { getErrorMessage, isUnreachable } = require('../routeros.service');

function mikrotikAppError(error, ip, user = '') {
  if (error instanceof AppError) return error;
  const message = getErrorMessage(error, ip, user);
  return isUnreachable(error)
    ? new AppError(message, 503, 'MIKROTIK_UNREACHABLE', { unreachable: true })
    : new AppError(message, 500, 'MIKROTIK_ERROR');
}

module.exports = { mikrotikAppError };
