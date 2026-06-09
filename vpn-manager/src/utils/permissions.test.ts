// ============================================================
//  permissions.test.ts — RBAC del frontend
//
//  Crítico: estas reglas controlan QUÉ módulos ve cada rol en el sidebar
//  y QUÉ acciones puede ejecutar. Cualquier regresión afecta seguridad
//  visible al usuario.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  isOwner,
  isModerator,
  isPlatformAdmin,
  visibleModules,
  canSeeModule,
  canInvite,
  canAssignCoModerator,
  canManageRoles,
  canRemoveMembers,
} from './permissions';
import type { SessionUser } from '../types/account';

// Factory mínimo de SessionUser
const u = (p: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  email: 'u@test',
  role: p.role ?? 'MEMBER',
  workspace_id: p.workspace_id ?? 'ws1',
  platform_admin: p.platform_admin ?? false,
  ...p,
});

describe('role predicates', () => {
  it('isOwner solo verdadero para OWNER', () => {
    expect(isOwner('OWNER')).toBe(true);
    expect(isOwner('CO_MODERATOR')).toBe(false);
    expect(isOwner('MEMBER')).toBe(false);
    expect(isOwner(undefined)).toBe(false);
  });

  it('isModerator: OWNER y CO_MODERATOR', () => {
    expect(isModerator('OWNER')).toBe(true);
    expect(isModerator('CO_MODERATOR')).toBe(true);
    expect(isModerator('MEMBER')).toBe(false);
  });

  it('isPlatformAdmin requiere session.platform_admin === true', () => {
    expect(isPlatformAdmin(u({ platform_admin: true }))).toBe(true);
    expect(isPlatformAdmin(u({ platform_admin: false }))).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
  });
});

describe('visibleModules', () => {
  it('sin sesión: solo "nodes" (pantalla pública/login)', () => {
    expect(visibleModules(null)).toEqual(['nodes']);
    expect(visibleModules(undefined)).toEqual(['nodes']);
  });

  it('platform_admin: dashboard + moderators + settings (sin equipo/nodos)', () => {
    const mods = visibleModules(u({ platform_admin: true }));
    expect(mods).toEqual(['dashboard', 'moderators', 'settings']);
    expect(mods).not.toContain('users');
    expect(mods).not.toContain('team');
  });

  it('MEMBER: solo "nodes" + "team" (su propio perfil)', () => {
    expect(visibleModules(u({ role: 'MEMBER' }))).toEqual(['nodes', 'team']);
  });

  it('OWNER: módulos del workspace + settings (sin dashboard ni moderators)', () => {
    const mods = visibleModules(u({ role: 'OWNER' }));
    expect(mods).toContain('nodes');
    expect(mods).toContain('users');
    expect(mods).toContain('team');
    expect(mods).toContain('monitor');
    expect(mods).toContain('settings');
    expect(mods).not.toContain('dashboard');
    expect(mods).not.toContain('moderators');
  });

  it('CO_MODERATOR ve lo mismo que OWNER', () => {
    expect(visibleModules(u({ role: 'CO_MODERATOR' }))).toEqual(
      visibleModules(u({ role: 'OWNER' })),
    );
  });
});

describe('canSeeModule', () => {
  it('MEMBER NO puede ver "users" (gestión de peers WG)', () => {
    expect(canSeeModule(u({ role: 'MEMBER' }), 'users')).toBe(false);
  });

  it('OWNER SÍ puede ver "users"', () => {
    expect(canSeeModule(u({ role: 'OWNER' }), 'users')).toBe(true);
  });

  it('platform_admin NO ve "team" (no es operador de workspace)', () => {
    expect(canSeeModule(u({ platform_admin: true }), 'team')).toBe(false);
  });

  it('platform_admin SÍ ve "moderators"', () => {
    expect(canSeeModule(u({ platform_admin: true }), 'moderators')).toBe(true);
  });
});

describe('action predicates', () => {
  describe('canInvite (envía invitaciones)', () => {
    it('OWNER y CO_MODERATOR pueden', () => {
      expect(canInvite('OWNER')).toBe(true);
      expect(canInvite('CO_MODERATOR')).toBe(true);
    });
    it('MEMBER NO puede', () => {
      expect(canInvite('MEMBER')).toBe(false);
    });
  });

  describe('canAssignCoModerator (asigna rol co-mod)', () => {
    it('SOLO el OWNER puede (regla del backend)', () => {
      expect(canAssignCoModerator('OWNER')).toBe(true);
      expect(canAssignCoModerator('CO_MODERATOR')).toBe(false);
      expect(canAssignCoModerator('MEMBER')).toBe(false);
    });
  });

  describe('canManageRoles (promover/degradar)', () => {
    it('SOLO el OWNER puede', () => {
      expect(canManageRoles('OWNER')).toBe(true);
      expect(canManageRoles('CO_MODERATOR')).toBe(false);
    });
  });

  describe('canRemoveMembers', () => {
    it('OWNER y CO_MODERATOR pueden remover', () => {
      expect(canRemoveMembers('OWNER')).toBe(true);
      expect(canRemoveMembers('CO_MODERATOR')).toBe(true);
    });
    it('MEMBER no puede', () => {
      expect(canRemoveMembers('MEMBER')).toBe(false);
    });
  });
});
