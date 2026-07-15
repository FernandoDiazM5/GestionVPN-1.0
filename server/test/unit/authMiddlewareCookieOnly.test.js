const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db.service', {
  getAppSetting: vi.fn().mockResolvedValue(null),
  decryptPass: vi.fn((value) => value),
});

stubModule(__dirname, '../../lib/metrics', {
  authFailsTotal: { inc: vi.fn() },
});

stubModule(__dirname, '../../lib/accountStatus', {
  getAccountStatus: vi.fn().mockResolvedValue('active'),
});

const { verifyToken, JWT_SECRET } = require('../../auth.middleware');

function createApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', verifyToken, (req, res) => res.json({ account: req.account }));
  return app;
}

describe('verifyToken cookie-only session', () => {
  let token;

  beforeEach(() => {
    token = jwt.sign({
      sub: 'user-1',
      email: 'user@example.com',
      workspace_id: 'ws-1',
      role: 'OWNER',
    }, JWT_SECRET, { expiresIn: '5m' });
  });

  it('rejects a valid JWT sent as Bearer', async () => {
    await request(createApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a valid JWT sent in the query string', async () => {
    await request(createApp())
      .get(`/protected?token=${encodeURIComponent(token)}`)
      .expect(401);
  });

  it('accepts an RBAC session in the HttpOnly cookie', async () => {
    const response = await request(createApp())
      .get('/protected')
      .set('Cookie', [`vpn_session=${token}`])
      .expect(200);

    expect(response.body.account).toMatchObject({ sub: 'user-1', workspace_id: 'ws-1' });
  });

  it('rejects a legacy cookie without workspace identity', async () => {
    const legacy = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, JWT_SECRET);
    await request(createApp())
      .get('/protected')
      .set('Cookie', [`vpn_session=${legacy}`])
      .expect(403);
  });
});
