const {
  COOKIE_NAME,
  CSRF_COOKIE_NAME,
  signSession,
  csrfTokenForSessionToken,
  setSessionCookie,
  clearSessionCookie,
} = require('../../lib/jwt');

function responseDouble() {
  return { cookie: vi.fn(), clearCookie: vi.fn() };
}

describe('JWT session cookies', () => {
  it('emite cookie HttpOnly de sesiÃ³n y cookie CSRF legible ligada al jti', () => {
    const res = responseDouble();
    const token = signSession({
      sub: 'user-1', email: 'user@example.com', workspace_id: 'ws-1', role: 'OWNER',
    });

    setSessionCookie(res, token);

    expect(res.cookie).toHaveBeenNthCalledWith(1, COOKIE_NAME, token, expect.objectContaining({
      httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: expect.any(Number),
    }));
    expect(res.cookie).toHaveBeenNthCalledWith(
      2,
      CSRF_COOKIE_NAME,
      csrfTokenForSessionToken(token),
      expect.objectContaining({
        httpOnly: false, sameSite: 'strict', secure: false, path: '/', maxAge: expect.any(Number),
      }),
    );
  });

  it('borra ambas cookies con los mismos atributos base', () => {
    const res = responseDouble();

    clearSessionCookie(res);

    expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_NAME, {
      httpOnly: true, sameSite: 'lax', secure: false, path: '/',
    });
    expect(res.clearCookie).toHaveBeenCalledWith(CSRF_COOKIE_NAME, {
      httpOnly: false, sameSite: 'strict', secure: false, path: '/',
    });
  });
});
