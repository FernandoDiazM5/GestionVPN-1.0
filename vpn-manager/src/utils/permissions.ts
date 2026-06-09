// ============================================================
//  Helpers de permisos RBAC (Fase 4)
//  Reflejan las reglas aplicadas en el backend (team.routes.js).
// ============================================================
import type { Role, SessionUser } from '../types/account';

export const isOwner = (role?: Role) => role === 'OWNER';
export const isModerator = (role?: Role) => role === 'OWNER' || role === 'CO_MODERATOR';

/** Administrador de plataforma (Sistemas). */
export const isPlatformAdmin = (s?: SessionUser | null) => !!s?.platform_admin;

export type ModuleId = 'dashboard' | 'moderators' | 'nodes' | 'devices' | 'users' | 'team' | 'monitor' | 'settings';

/**
 * Módulos visibles según la sesión (RBAC + plataforma).
 *  - Administrador (Sistemas): plataforma (dashboard + moderadores) + Ajustes,
 *    porque la config del router core (MikroTik compartido) es infraestructura
 *    de plataforma y solo él la gestiona.
 *  - Moderador (OWNER): sistema operativo de su workspace (sin Ajustes).
 *  - View (MEMBER): solo sus túneles + su perfil (en Equipo).
 */
export function visibleModules(s?: SessionUser | null): ModuleId[] {
  if (!s) return ['nodes'];
  // Administrador (Sistemas): operador de plataforma. Dashboard + Moderadores +
  // Ajustes (única vista que configura el router core compartido).
  if (s.platform_admin) {
    return ['dashboard', 'moderators', 'settings'];
  }
  if (s.role === 'MEMBER') return ['nodes', 'team'];
  // Moderador (OWNER / CO_MODERATOR) → sistema operativo de su workspace.
  // Ajustes para el moderador = perfil + workspace + import/export (Fase C).
  // El SettingsModule del Administrador (config del router core) NO se ve.
  return ['nodes', 'devices', 'users', 'team', 'monitor', 'settings'];
}

export const canSeeModule = (s: SessionUser | null | undefined, m: ModuleId) => visibleModules(s).includes(m);

/** Puede invitar miembros. */
export const canInvite = (role?: Role) => isModerator(role);
/** Puede asignar el rol de co-moderador (solo el propietario). */
export const canAssignCoModerator = (role?: Role) => isOwner(role);
/** Puede cambiar roles (promover/degradar) — solo el propietario. */
export const canManageRoles = (role?: Role) => isOwner(role);
/** Puede remover miembros. */
export const canRemoveMembers = (role?: Role) => isModerator(role);
