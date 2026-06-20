// M2 — las guardas de autorización derivan de req.account (RBAC), nunca del rol
// legacy req.user.role (que mapRbacRole conflaba OWNER/CO_MOD→'admin' = origen A2).
import { describe, it, expect, vi } from 'vitest';
const { isPlatformAdmin, isModerator, requireModerator } = require('../../lib/routeGuards');

const reqWith = (account, user) => ({ account, user });
const mkRes = () => { const r = { status: vi.fn(() => r), json: vi.fn(() => r) }; return r; };

describe('routeGuards — predicados RBAC (M2)', () => {
  it('isPlatformAdmin: solo true para platform_admin', () => {
    expect(isPlatformAdmin(reqWith({ platform_admin: true }))).toBe(true);
    expect(isPlatformAdmin(reqWith({ role: 'OWNER' }))).toBe(false);
    expect(isPlatformAdmin(reqWith(null))).toBe(false);
  });

  it('isModerator: platform_admin / OWNER / CO_MODERATOR true; MEMBER false', () => {
    expect(isModerator(reqWith({ platform_admin: true }))).toBe(true);
    expect(isModerator(reqWith({ role: 'OWNER' }))).toBe(true);
    expect(isModerator(reqWith({ role: 'CO_MODERATOR' }))).toBe(true);
    expect(isModerator(reqWith({ role: 'MEMBER' }))).toBe(false);
    expect(isModerator(reqWith(null))).toBe(false);
  });

  it('NO se deja engañar por el rol legacy req.user.role (origen de A2)', () => {
    // user.role='admin' (legacy) pero account.role='MEMBER' → NO es moderador.
    expect(isModerator(reqWith({ role: 'MEMBER' }, { role: 'admin' }))).toBe(false);
    expect(isPlatformAdmin(reqWith({ role: 'MEMBER' }, { role: 'admin' }))).toBe(false);
  });

  it('requireModerator: MEMBER (aunque user.role=admin) → 403; OWNER → next()', () => {
    const res = mkRes();
    const next = vi.fn();
    requireModerator(reqWith({ role: 'MEMBER' }, { role: 'admin' }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    const next2 = vi.fn();
    requireModerator(reqWith({ role: 'OWNER' }), mkRes(), next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });
});
