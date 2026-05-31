// ============================================================
//  Helpers de permisos RBAC (Fase 4)
//  Reflejan las reglas aplicadas en el backend (team.routes.js).
// ============================================================
import type { Role } from '../types/account';

export const isOwner = (role?: Role) => role === 'OWNER';
export const isModerator = (role?: Role) => role === 'OWNER' || role === 'CO_MODERATOR';

/** Puede invitar miembros. */
export const canInvite = (role?: Role) => isModerator(role);
/** Puede asignar el rol de co-moderador (solo el propietario). */
export const canAssignCoModerator = (role?: Role) => isOwner(role);
/** Puede cambiar roles (promover/degradar) — solo el propietario. */
export const canManageRoles = (role?: Role) => isOwner(role);
/** Puede remover miembros. */
export const canRemoveMembers = (role?: Role) => isModerator(role);
