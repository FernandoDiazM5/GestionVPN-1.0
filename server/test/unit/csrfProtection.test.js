const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { csrfProtection } = require('../../middleware/csrfProtection');
const { signSession, csrfTokenForSessionToken } = require('../../lib/jwt');

function app() {
  const instance = express();
  instance.use(cookieParser());
  instance.use(csrfProtection);
  instance.post('/api/protected', (_req, res) => res.sendStatus(204));
  instance.post('/api/auth/login', (_req, res) => res.sendStatus(204));
  return instance;
}

function sessionCookies() {
  const token = signSession({
    sub: 'user-1', email: 'user@example.com', workspace_id: 'ws-1', role: 'OWNER', platform_admin: false,
  });
  const csrf = csrfTokenForSessionToken(token);
  return { token, csrf, cookie: [`vpn_session=${token}`, `vpn_csrf=${csrf}`] };
}

describe('csrfProtection', () => {
  it('acepta una mutación autenticada con Origin y token ligado al jti', async () => {
    const session = sessionCookies();
    await request(app()).post('/api/protected')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .expect(204);
  });

  it('rechaza Origin cross-site incluso en endpoints públicos', async () => {
    const response = await request(app()).post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .expect(403);
    expect(response.body.code).toBe('ORIGIN_FORBIDDEN');
  });

  it('rechaza mutación autenticada sin Origin', async () => {
    const session = sessionCookies();
    const response = await request(app()).post('/api/protected')
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .expect(403);
    expect(response.body.code).toBe('ORIGIN_REQUIRED');
  });

  it('rechaza token ausente o no ligado a la sesión', async () => {
    const session = sessionCookies();
    const missing = await request(app()).post('/api/protected')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', session.cookie)
      .expect(403);
    expect(missing.body.code).toBe('CSRF_INVALID');

    const mismatch = await request(app()).post('/api/protected')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', 'not-the-session-token')
      .expect(403);
    expect(mismatch.body.code).toBe('CSRF_INVALID');
  });

  it('permite clientes no navegador sin cookie y protege login sólo por Origin si existe', async () => {
    await request(app()).post('/api/protected').expect(204);
    await request(app()).post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .expect(204);
  });
});
