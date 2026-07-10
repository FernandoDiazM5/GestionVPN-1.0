// ============================================================
//  multiWorkspace.test.js — contratos de multi-membresía:
//  invitación por username (XOR) y switch de workspace.
// ============================================================
const {
  InviteRequestSchema,
  SwitchWorkspaceRequestSchema,
} = require('@gestionvpn/contracts');

describe('InviteRequestSchema — email XOR username', () => {
  it('acepta email solo (flujo clásico)', () => {
    const d = InviteRequestSchema.parse({ email: 'x@y.com' });
    expect(d.email).toBe('x@y.com');
    expect(d.username).toBeUndefined();
    expect(d.role).toBe('MEMBER');
  });

  it('acepta username solo (usuario existente, invitación in-app)', () => {
    const d = InviteRequestSchema.parse({ username: 'soporte1' });
    expect(d.username).toBe('soporte1');
    expect(d.email).toBeUndefined();
  });

  it('normaliza el username (trim + lowercase)', () => {
    const d = InviteRequestSchema.parse({ username: '  Soporte1 ' });
    expect(d.username).toBe('soporte1');
  });

  it('rechaza ambos y ninguno (XOR)', () => {
    expect(() => InviteRequestSchema.parse({ email: 'x@y.com', username: 'soporte1' })).toThrow();
    expect(() => InviteRequestSchema.parse({})).toThrow();
  });

  it('rechaza username con formato inválido', () => {
    for (const bad of ['ab', 'con espacios', 'con@arroba']) {
      expect(() => InviteRequestSchema.parse({ username: bad })).toThrow();
    }
  });

  it('solo permite rol MEMBER', () => {
    expect(() => InviteRequestSchema.parse({ email: 'x@y.com', role: 'OWNER' })).toThrow();
  });

  it('acepta tunnelId opcional', () => {
    const d = InviteRequestSchema.parse({ username: 'soporte1', tunnelId: 'VRF-ND2-TORRE' });
    expect(d.tunnelId).toBe('VRF-ND2-TORRE');
  });
});

describe('SwitchWorkspaceRequestSchema', () => {
  it('acepta un workspaceId', () => {
    const d = SwitchWorkspaceRequestSchema.parse({ workspaceId: 'ce550bfc-84c6-4ff0-b965-71004ea25ae7' });
    expect(d.workspaceId).toBeTruthy();
  });

  it('rechaza vacío o ausente', () => {
    expect(() => SwitchWorkspaceRequestSchema.parse({ workspaceId: '' })).toThrow();
    expect(() => SwitchWorkspaceRequestSchema.parse({})).toThrow();
  });
});
