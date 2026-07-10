// ============================================================
//  localAccount.js — Cuentas LOCALES (username sin correo real).
//
//  `users.email` es NOT NULL + UNIQUE; una cuenta creada solo con usuario
//  recibe el email SINTÉTICO `<username>@local.app` (mismo patrón que el
//  bridge legacy de sessionBridge.js y los seeds). El UNIQUE del email da
//  gratis la unicidad del username. Ese dominio JAMÁS recibe correo:
//  notifier y password-reset tratan el sintético como "sin email".
//
//  Fuente de verdad de LOCAL_DOMAIN/syntheticEmail/isSyntheticEmail:
//  @gestionvpn/contracts (compartida con el frontend).
// ============================================================

const { LOCAL_DOMAIN, syntheticEmail, isSyntheticEmail } = require('@gestionvpn/contracts');

// Usuario que opera la plataforma (Administrador / Sistemas). Configurable.
const PLATFORM_ADMIN_USERNAME = (process.env.PLATFORM_ADMIN_USERNAME || 'admin').toLowerCase();

// Usernames que nunca puede reclamar un moderador (el del admin de plataforma
// colisionaría con el bridge legacy; el resto son convenciones peligrosas).
const RESERVED_USERNAMES = new Set(['admin', 'root', 'system', PLATFORM_ADMIN_USERNAME]);

/** ¿El username está reservado para la plataforma? */
const isReservedUsername = (username) =>
  RESERVED_USERNAMES.has(String(username || '').trim().toLowerCase());

module.exports = {
  LOCAL_DOMAIN,
  syntheticEmail,
  isSyntheticEmail,
  isReservedUsername,
  PLATFORM_ADMIN_USERNAME,
};
