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
 *  - Administrador (Sistemas): solo opera la plataforma (dashboard + moderadores).
 *  - Moderador (OWNER): sistema completo.
 *  - View (MEMBER): solo sus túneles + equipo(perfil) + ajustes(perfil).
 */
export function visibleModules(s?: SessionUser | null): ModuleId[] {
  if (!s) return ['nodes'];
  // Administrador (Sistemas): super-usuario. Ve la plataforma (dashboard +
  // moderadores) Y los módulos operativos (administra el router físico).
  if (s.platform_admin) {
    return ['dashboard', 'moderators', 'nodes', 'devices', 'users', 'team', 'monitor', 'settings'];
  }
  if (s.role === 'MEMBER') return ['nodes', 'team', 'settings'];
  // Moderador (OWNER / CO_MODERATOR) → sistema completo de su workspace
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
