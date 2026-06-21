// ============================================================
//  Helpers de permisos RBAC (Fase 4)
//  Reflejan las reglas aplicadas en el backend (team.routes.js).
// ============================================================
import type { Role, SessionUser } from '../types/account';

export const isOwner = (role?: Role) => role === 'OWNER';
// Único rol de moderación del workspace = OWNER (CO_MODERATOR retirado).
export const isModerator = (role?: Role) => role === 'OWNER';

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
  // MEMBER: nodos + equipo + ajustes (perfil + vincular Telegram).
  // El ModeratorSettingsModule filtra tabs según el rol — el MEMBER solo
  // ve "Perfil" (cambiar contraseña/correo) y "Notificaciones" (solo Telegram).
  if (s.role === 'MEMBER') return ['nodes', 'team', 'settings'];
  // Moderador (OWNER) → sistema operativo de su workspace.
  // Ajustes para el moderador = perfil + workspace + import/export (Fase C).
  // El SettingsModule del Administrador (config del router core) NO se ve.
  // 'users' (Gestión WG) se unificó dentro de 'team' como una tab — el item del
  // sidebar ya no existe. El ModuleId se mantiene como tipo válido por si una
  // URL vieja lo referencia, pero ningún flujo navegable apunta ahí.
  return ['nodes', 'devices', 'team', 'monitor', 'settings'];
}

export const canSeeModule = (s: SessionUser | null | undefined, m: ModuleId) => visibleModules(s).includes(m);

/** Puede invitar miembros. */
export const canInvite = (role?: Role) => isModerator(role);
/** Puede remover miembros. */
export const canRemoveMembers = (role?: Role) => isModerator(role);
