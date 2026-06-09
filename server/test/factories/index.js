// ============================================================
//  Factories — generan objetos válidos para tests sin tener que
//  recordar todos los campos del schema.
//
//  Convención: cada factory acepta overrides parciales:
//
//    const u = makeUser({ email: 'custom@x.com' });
//    const ws = makeWorkspace({ owner_id: u.id });
// ============================================================
const crypto = require('crypto');

const now = () => Date.now();

function makeUser(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    email: overrides.email || `u-${id.slice(0, 8)}@test.local`,
    password_hash: overrides.password_hash || '$2a$10$fakehash',
    name: overrides.name || 'Test User',
    is_platform_admin: overrides.is_platform_admin ?? 0,
    email_verified: overrides.email_verified ?? 1,
    otp_hash: overrides.otp_hash ?? null,
    otp_expires_at: overrides.otp_expires_at ?? null,
    otp_attempts: overrides.otp_attempts ?? 0,
    disabled_at: overrides.disabled_at ?? null,
    deleted_at: overrides.deleted_at ?? null,
    created_at: overrides.created_at ?? now(),
    updated_at: overrides.updated_at ?? now(),
  };
}

function makeWorkspace(overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  return {
    id,
    name: overrides.name || `Workspace ${id.slice(0, 6)}`,
    owner_id: overrides.owner_id || crypto.randomUUID(),
    deleted_at: overrides.deleted_at ?? null,
    created_at: overrides.created_at ?? now(),
    updated_at: overrides.updated_at ?? now(),
  };
}

function makeMembership({ workspaceId, userId, role = 'MEMBER' } = {}) {
  return {
    id: crypto.randomUUID(),
    workspace_id: workspaceId || crypto.randomUUID(),
    user_id: userId || crypto.randomUUID(),
    role,
    invited_by: null,
    created_at: now(),
    deleted_at: null,
  };
}

function makeNode(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    ppp_user: overrides.ppp_user || 'vpn-test-01',
    mikrotik_id: overrides.mikrotik_id || '*1',
    nombre_nodo: overrides.nombre_nodo || 'Test Node',
    nombre_vrf: overrides.nombre_vrf || 'VRF-TEST-01',
    iface_name: overrides.iface_name || '<sstp-test>',
    segmento_lan: overrides.segmento_lan || '10.10.0.0/24',
    ip_tunnel: overrides.ip_tunnel || '192.168.0.1',
    ppp_password_enc: overrides.ppp_password_enc ?? null,
    label: overrides.label || '',
    server_ip: overrides.server_ip || '',
    wg_public_key: overrides.wg_public_key || '',
    lan_subnets: overrides.lan_subnets || '[]',
    protocol: overrides.protocol || 'sstp',
    node_number: overrides.node_number ?? null,
    workspace_id: overrides.workspace_id ?? null,
    created_at: now(),
    updated_at: now(),
  };
}

function makeInvitation(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    workspace_id: overrides.workspace_id || crypto.randomUUID(),
    email: overrides.email || 'invite@test.local',
    name: overrides.name ?? null,
    otp_hash: overrides.otp_hash || '$2a$08$fakeOtpHash',
    role: overrides.role || 'MEMBER',
    status: overrides.status || 'PENDING',
    tunnel_id: overrides.tunnel_id ?? null,
    invited_by: overrides.invited_by ?? null,
    attempts: 0,
    expires_at: overrides.expires_at ?? now() + 86_400_000,
    created_at: now(),
  };
}

module.exports = {
  makeUser,
  makeWorkspace,
  makeMembership,
  makeNode,
  makeInvitation,
};
