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

// ── Predicados de rol RBAC (fuente de verdad: req.account) ───────────────────
//  M2: las decisiones de autorización derivan de req.account (RBAC real:
//  platform_admin + role OWNER/MEMBER), NUNCA del rol legacy req.user.role
//  (que mapRbacRole conflaba OWNER→'admin' — origen de A2).

/** ¿El solicitante es Administrador de plataforma? */
function isPlatformAdmin(req) {
  return !!req.account?.platform_admin;
}

/** ¿Es moderador (OWNER) o admin de plataforma? (NO un MEMBER). */
function isModerator(req) {
  const acc = req.account;
  return !!acc && (acc.platform_admin || acc.role === 'OWNER');
}

/** Guard de mutación: moderador (OWNER) o platform_admin. MEMBER/anónimo → 403. */
function requireModerator(req, res, next) {
  if (isModerator(req)) return next();
  return res.status(403).json({ success: false, message: 'Acceso denegado: se requiere rol de moderador o administrador.' });
}

module.exports = { requireMikrotik, isPlatformAdmin, isModerator, requireModerator };
