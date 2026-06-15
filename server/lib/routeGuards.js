// ============================================================
//  routeGuards.js — guards reutilizables para handlers Express
//  Fase F5.A: centralizan validaciones que antes se repetían en
//  cada archivo de rutas.
// ============================================================
const { AppError } = require('./apiResponse');

/**
 * Garantiza que req.mikrotik está disponible (credenciales del router core
 * configuradas). Llamarlo desde un handler con asyncHandler envuelto.
 * El campo legacy `needsConfig: true` se mantiene por compatibilidad con el
 * cliente antiguo (utils/apiClient.ts). F5.C migra los consumidores al
 * código `NEEDS_CONFIG`.
 *
 * @param {import('express').Request} req
 * @returns {{ip: string, user: string, pass: string}}
 */
function requireMikrotik(req) {
  if (!req.mikrotik) {
    throw new AppError(
      'Configura las credenciales MikroTik en Ajustes antes de continuar.',
      503,
      'NEEDS_CONFIG',
      { needsConfig: true }
    );
  }
  return req.mikrotik;
}

module.exports = { requireMikrotik };
