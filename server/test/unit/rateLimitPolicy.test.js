const express = require('express');
const request = require('supertest');
const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db/mysql', { query: vi.fn() });
const bucketMocks = stubModule(__dirname, '../../db/repos/authRateBucketRepo', {
  consume: vi.fn(),
  clear: vi.fn(),
});

const rl = require('../../lib/rateLimit');

function loginApp(onSuccess = false) {
  const app = express();
  app.use(express.json());
  app.post('/login', rl.guardPolicy('LOGIN'), async (req, res, next) => {
    try {
      if (onSuccess) await rl.clearSuccessfulIdentity(req);
      res.json({ ip: req._clientIp });
    } catch (error) { next(error); }
  });
  return app;
}

describe('atomic auth rate-limit policy', () => {
  beforeEach(() => {
    bucketMocks.consume.mockReset().mockResolvedValue({ allowed: true, count: 1, retryAfterMs: 0 });
    bucketMocks.clear.mockReset().mockResolvedValue({ affectedRows: 1 });
  });

  it('stores HMAC hashes, never the raw IP or email', async () => {
    await request(loginApp())
      .post('/login')
      .send({ email: 'User@Example.com', password: 'irrelevant' })
      .expect(200);

    expect(bucketMocks.consume).toHaveBeenCalledTimes(3);
    for (const [input] of bucketMocks.consume.mock.calls) {
      expect(input.bucketHash).toMatch(/^[a-f0-9]{64}$/);
      expect(input.bucketHash).not.toContain('user@example.com');
      expect(input.bucketHash).not.toContain('127.0.0.1');
    }
  });

  it('returns a generic 429 with Retry-After before the handler runs', async () => {
    bucketMocks.consume.mockResolvedValueOnce({ allowed: false, count: 21, retryAfterMs: 42_100 });

    const response = await request(loginApp())
      .post('/login')
      .send({ email: 'user@example.com' })
      .expect(429);

    expect(response.headers['retry-after']).toBe('43');
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('clears only identity and pair buckets after successful authentication', async () => {
    await request(loginApp(true))
      .post('/login')
      .send({ email: 'user@example.com' })
      .expect(200);

    expect(bucketMocks.clear).toHaveBeenCalledTimes(2);
    expect(bucketMocks.clear.mock.calls.map((call) => call[1]).sort())
      .toEqual(['LOGIN_ID', 'LOGIN_PAIR']);
  });

  it('adds a persistent one-minute identity cooldown to OTP sends', async () => {
    const app = express();
    app.use(express.json());
    app.post('/resend', rl.guardPolicy('OTP_SEND'), (_req, res) => res.sendStatus(204));

    await request(app).post('/resend').send({ email: 'user@example.com' }).expect(204);

    expect(bucketMocks.consume).toHaveBeenCalledTimes(4);
    expect(bucketMocks.consume).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'OTP_SEND_COOLDOWN',
      limit: 1,
      windowMs: 60_000,
      blockMs: 60_000,
    }));
  });

  it('fails closed in production when the HMAC key is missing or a placeholder', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousKey = process.env.AUTH_RATE_HMAC_KEY;
    process.env.NODE_ENV = 'production';
    process.env.AUTH_RATE_HMAC_KEY = '<GENERAR_CON_OPENSSL_RAND_HEX_32>';
    expect(() => rl.assertRateLimitConfig()).toThrow('AUTH_RATE_HMAC_KEY');
    process.env.NODE_ENV = previousNodeEnv;
    if (previousKey === undefined) delete process.env.AUTH_RATE_HMAC_KEY;
    else process.env.AUTH_RATE_HMAC_KEY = previousKey;
  });
});
