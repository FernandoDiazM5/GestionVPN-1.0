// ============================================================
//  identity.ts — identidad de cuentas LOCALES (username sin correo real).
//
//  Una cuenta creada solo con usuario lleva el email SINTÉTICO
//  `<username>@local.app` (users.email es NOT NULL en BD). Ese correo no
//  existe: la UI debe mostrar el username y "sin correo" en su lugar.
//  Fuente de verdad del dominio: @gestionvpn/contracts.
// ============================================================
import { isSyntheticEmail } from '@gestionvpn/contracts';

/** ¿La cuenta es local (creada con usuario, sin correo real asociado)? */
export const isLocalAccount = (email: string | null | undefined): boolean =>
  isSyntheticEmail(email);

/** Parte local del email: `pepe@local.app` → `pepe`. Fallback seguro. */
export const localUsername = (email: string | null | undefined): string =>
  String(email ?? '').split('@')[0] || '—';

/** Email para mostrar: el real, o `null` si es sintético (cuenta local). */
export const displayEmail = (email: string | null | undefined): string | null =>
  email && !isSyntheticEmail(email) ? email : null;
