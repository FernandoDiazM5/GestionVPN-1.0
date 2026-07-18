const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db.service', {
  getAppSetting: vi.fn().mockResolvedValue(null),
  decryptPass: vi.fn(value => value),
});

const metricsMocks = stubModule(__dirname, '../../lib/metrics', {
  authFailsTotal: { inc: vi.fn() },
});

const authSessionMocks = stubModule(__dirname, '../../db/repos/authSessionRepo', {
  findState: vi.fn(),
  revokeAll: vi.fn(),
});

const { verifyToken } = require('../../auth.middleware');
const { JWT_SECRET, signSession } = require('../../lib/jwt');

function createApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', verifyToken, (req, res) => res.json({ account: req.account }));
  return app;
}

const activeState = {
  expires_at: Date.now() + 300_000,
  revoked_at: null,
  email: 'user@example.com',
  deleted_at: null,
  disabled_at: null,
  is_platform_admin: 0,
  membership_role: 'OWNER',
  workspace_exists: 'ws-1',
};

describe('verifyToken cookie-only session', () => {
  let token;

  beforeEach(() => {
    vi.clearAllMocks();
    authSessionMocks.findState.mockResolvedValue({ ...activeState });
    token = signSession({
      sub: 'user-1',
      email: 'user@example.com',
      workspace_id: 'ws-1',
      role: 'OWNER',
      platform_admin: false,
    });
  });

  it('rejects a valid JWT sent as Bearer', async () => {
    await request(createApp()).get('/protected').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects a valid JWT sent in the query string', async () => {
    await request(createApp()).get(`/protected?token=${encodeURIComponent(token)}`).expect(401);
  });

  it('accepts a registered RBAC session in the HttpOnly cookie', async () => {
    const response = await request(createApp())
      .get('/protected')
      .set('Cookie', [`vpn_session=${token}`])
      .expect(200);

    expect(response.body.account).toMatchObject({ sub: 'user-1', workspace_id: 'ws-1' });
    expect(authSessionMocks.findState).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', workspaceId: 'ws-1', jti: expect.any(String),
    }));
  });

  it('rejects a legacy cookie without issuer, audience or jti', async () => {
    const legacy = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, JWT_SECRET);
    const response = await request(createApp())
      .get('/protected')
      .set('Cookie', [`vpn_session=${legacy}`])
      .expect(401);
    expect(response.body.code).toBe('SESSION_EXPIRED');
  });

  it('fails closed with 503 when session state cannot be checked', async () => {
    authSessionMocks.findState.mockRejectedValue(Object.assign(new Error('db down'), { code: 'ECONNREFUSED' }));
    const response = await request(createApp())
      .get('/protected')
      .set('Cookie', [`vpn_session=${token}`])
      .expect(503);
    expect(response.body.code).toBe('AUTH_STATE_UNAVAILABLE');
    expect(metricsMocks.authFailsTotal.inc).toHaveBeenCalledWith({ reason: 'auth_state_unavailable' });
  });

  it('rejects a revoked server-side session immediately', async () => {
    authSessionMocks.findState.mockResolvedValue({ ...activeState, revoked_at: Date.now() });
    const response = await request(createApp())
      .get('/protected')
      .set('Cookie', [`vpn_session=${token}`])
      .expect(401);
    expect(response.body.code).toBe('SESSION_REVOKED');
  });
});
