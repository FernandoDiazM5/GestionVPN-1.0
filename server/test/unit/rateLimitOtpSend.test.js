const express = require('express');
const request = require('supertest');
const { stubModule } = require('../helpers/moduleMock');

const mysqlMocks = stubModule(__dirname, '../../db/mysql', {
  query: vi.fn(),
});

const { guardOtpSend, otpSendStatus } = require('../../lib/rateLimit');

function appWithGuard() {
  const app = express();
  app.use(express.json());
  app.post('/otp', guardOtpSend(), (req, res) => {
    res.json({ ip: req._clientIp });
  });
  return app;
}

describe('OTP send rate limit', () => {
  beforeEach(() => {
    mysqlMocks.query.mockReset();
  });

  it('blocks after the hourly send limit', async () => {
    mysqlMocks.query.mockResolvedValue([{ sends: 5, last_send: Date.now() - 120_000 }]);
    const status = await otpSendStatus('10.0.0.1', 'USER@example.com');
    expect(status.blocked).toBe(true);
  });

  it('blocks repeated sends during the cooldown and sets Retry-After', async () => {
    mysqlMocks.query.mockResolvedValue([{ sends: 1, last_send: Date.now() - 5_000 }]);
    const response = await request(appWithGuard())
      .post('/otp')
      .send({ email: 'user@example.com' })
      .expect(429);

    expect(response.body.code).toBe('OTP_SEND_RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('allows a send when there are no recent requests', async () => {
    mysqlMocks.query.mockResolvedValue([{ sends: 0, last_send: null }]);
    await request(appWithGuard())
      .post('/otp')
      .send({ email: 'user@example.com' })
      .expect(200);
  });
});
