const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db.service', {
  getDb: vi.fn().mockResolvedValue({ get: vi.fn(), all: vi.fn(), run: vi.fn() }),
});
stubModule(__dirname, '../../routeros.service', {
  connectToMikrotik: vi.fn(),
  safeWrite: vi.fn(),
  writeIdempotent: vi.fn(),
  parseHandshakeSecs: vi.fn(),
  getErrorMessage: (e) => e?.message || 'error',
});
stubModule(__dirname, '../../lib/logger', {
  child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
});

const express = require('express');
const request = require('supertest');
const routes = require('../../routes/wireguard.routes');
const { errorMiddleware } = require('../../lib/apiResponse');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const role = req.headers['x-test-role'];
  req.account = {
    sub: role === 'MEMBER' ? 'member-1' : 'owner-1',
    workspace_id: 'ws-1',
    role: role || 'OWNER',
    platform_admin: false,
  };
  next();
});
app.use('/api', routes);
app.use(errorMiddleware);

describe('WireGuard management RBAC', () => {
  for (const route of ['/api/wireguard/peer/add', '/api/wireguard/peer/edit']) {
    it(`${route} rechaza MEMBER antes de tocar RouterOS`, async () => {
      const r = await request(app).post(route)
        .set('x-test-role', 'MEMBER')
        .send(route.endsWith('/add')
          ? { name: 'peer', publicKey: 'A'.repeat(43) + '=' }
          : { peerId: '*1', newName: 'peer' });
      expect(r.status).toBe(403);
    });
  }
});
