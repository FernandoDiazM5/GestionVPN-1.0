const {
  collectInventory,
  renderMarkdown,
} = require('../../tools/security-route-inventory');

describe('security route inventory', () => {
  const inventory = collectInventory();

  it('detects the application route surface', () => {
    expect(inventory.length).toBeGreaterThan(50);
    expect(inventory.some((route) => route.file === 'auth.routes.js' && route.path === '/login')).toBe(true);
    expect(inventory.some((route) => route.file === 'routes/account.routes.js' && route.path === '/login')).toBe(true);
  });

  it('flags the legacy login when it lacks rate limiting', () => {
    const legacyLogin = inventory.find((route) => route.file === 'auth.routes.js' && route.path === '/login');

    expect(legacyLogin.authenticated).toBe(false);
    expect(legacyLogin.validatesBody).toBe(true);
    expect(legacyLogin.rateLimited).toBe(false);
    expect(legacyLogin.risks).toContain('PUBLIC_RATE_LIMIT_MISSING');
  });

  it('recognizes the protected account login limiter', () => {
    const accountLogin = inventory.find((route) => route.file === 'routes/account.routes.js' && route.path === '/login');

    expect(accountLogin.authenticated).toBe(false);
    expect(accountLogin.rateLimited).toBe(true);
    expect(accountLogin.risks).not.toContain('PUBLIC_RATE_LIMIT_MISSING');
  });

  it('recognizes global authentication and body-schema debt in AP routes', () => {
    const apDebt = inventory.find((route) => (
      route.file === 'ap.routes.js' && route.usesBody && !route.validatesBody
    ));

    expect(apDebt).toBeDefined();
    expect(apDebt.authenticated).toBe(true);
    expect(apDebt.risks).toContain('BODY_SCHEMA_MISSING');
    expect(Array.isArray(apDebt.sinks)).toBe(true);
  });

  it('renders a deterministic Markdown report', () => {
    const first = renderMarkdown(inventory);
    const second = renderMarkdown(collectInventory());

    expect(second).toBe(first);
    expect(first).toContain('# Inventario de seguridad de rutas API');
    expect(first).toContain('`PUBLIC_RATE_LIMIT_MISSING`');
  });
});
