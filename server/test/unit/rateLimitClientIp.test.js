const express = require('express');
const request = require('supertest');
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
});

const { clientIp } = require('../../lib/rateLimit');

function ipApp(trustProxy) {
  const app = express();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.get('/ip', (req, res) => res.json({ ip: clientIp(req) }));
  return app;
}

describe('rate-limit client IP', () => {
  it('ignores a spoofed X-Forwarded-For header without a trusted proxy', async () => {
    const response = await request(ipApp())
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.99')
      .expect(200);

    expect(response.body.ip).toBe('127.0.0.1');
  });

  it('uses the client address selected by Express behind exactly one proxy', async () => {
    const response = await request(ipApp(1))
      .get('/ip')
      .set('X-Forwarded-For', '198.51.100.24')
      .expect(200);

    expect(response.body.ip).toBe('198.51.100.24');
  });

  it('selects the nearest untrusted address when a client prepends a spoofed hop', async () => {
    const response = await request(ipApp(1))
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.24')
      .expect(200);

    expect(response.body.ip).toBe('198.51.100.24');
  });

  it('normalizes IPv4-mapped IPv6 addresses and caps stored length', () => {
    expect(clientIp({ ip: '::ffff:10.20.30.40' })).toBe('10.20.30.40');
    expect(clientIp({ ip: 'a'.repeat(80) })).toBe('a'.repeat(64));
  });
});
