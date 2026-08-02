const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db/repos/webSecurityEventRepo', {
  record: vi.fn(), listRecent: vi.fn(), purgeOlderThan: vi.fn(),
});
stubModule(__dirname, '../../lib/rateLimit', {
  bucketHash: vi.fn((_scope, value) => `hash:${value}`),
  clientIp: vi.fn(req => req.ip),
});

const observation = require('../../lib/webSecurityObservation');
const originalVpsPublicIp = process.env.VPS_PUBLIC_IP;
const originalWgPublicIp = process.env.WG_PUBLIC_IP;

const event = (type, ip, at, extra = {}) => ({ event_type: type, source_ip: ip,
  occurred_at: at, identity_hash: null, user_id: null, route_group: null, ...extra });

describe('observacion pasiva de seguridad web', () => {
  beforeEach(() => {
    delete process.env.VPS_PUBLIC_IP;
    delete process.env.WG_PUBLIC_IP;
    require('../../db/repos/webSecurityEventRepo').record.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalVpsPublicIp === undefined) delete process.env.VPS_PUBLIC_IP;
    else process.env.VPS_PUBLIC_IP = originalVpsPublicIp;
    if (originalWgPublicIp === undefined) delete process.env.WG_PUBLIC_IP;
    else process.env.WG_PUBLIC_IP = originalWgPublicIp;
  });

  it('conserva incidentes durante 90 días', () => {
    expect(observation.RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('no registra ni muestra la IP del VPS o del endpoint MikroTik', async () => {
    process.env.VPS_PUBLIC_IP = '134.199.212.232';
    process.env.WG_PUBLIC_IP = '213.173.36.232';
    const repo = require('../../db/repos/webSecurityEventRepo');
    repo.record.mockClear();
    await observation.record({ eventType: 'API_NOT_FOUND', sourceIp: '134.199.212.232' });
    await observation.record({ eventType: 'API_NOT_FOUND', sourceIp: '213.173.36.232' });
    expect(repo.record).not.toHaveBeenCalled();

    repo.listRecent.mockResolvedValue([
      event('API_NOT_FOUND', '134.199.212.232', 99),
      event('API_NOT_FOUND', '213.173.36.232', 98),
      event('API_NOT_FOUND', '198.51.100.7', 97),
    ]);
    const snapshot = await observation.observation({ now: 100 });
    expect(snapshot.systemTrusted).toEqual(['134.199.212.232/32', '213.173.36.232/32']);
    expect(snapshot.sources.map((source) => source.sourceIp)).toEqual(['198.51.100.7']);
    expect(snapshot.events.map((item) => item.sourceIp)).toEqual(['198.51.100.7']);
  });

  it('seudonimiza identidades y normaliza rutas sin query ni UUID', () => {
    expect(observation.identityHash(' User@Example.com ')).toBe('hash:user@example.com');
    expect(observation.routeGroup('/api/items/00000000-0000-4000-8000-000000000099?token=secret'))
      .toBe('/api/items/:uuid');
  });

  it('no recomienda ban global por una contraseña olvidada en una sola cuenta', () => {
    const now = 10_000_000;
    const events = Array.from({ length: 10 }, (_, index) => event('AUTH_FAILURE', '203.0.113.8', now - index,
      { identity_hash: 'same-account', user_id: 'known-user' }));
    expect(observation.summarize(events, now)[0].recommendations).toEqual([]);
  });

  it('marca abuso de login distribuido y escaneos según los umbrales de simulación', () => {
    const now = 20_000_000;
    const events = [
      ...Array.from({ length: 10 }, (_, index) => event('AUTH_FAILURE', '198.51.100.7', now - index,
        { identity_hash: `identity-${index % 3}` })),
      ...Array.from({ length: 20 }, (_, index) => event('RATE_LIMITED', '198.51.100.7', now - index,
        { detail: JSON.stringify({ flow: 'LOGIN' }) })),
      ...Array.from({ length: 30 }, (_, index) => event('API_NOT_FOUND', '198.51.100.7', now - index,
        { route_group: `/scan/${index % 10}` })),
      ...Array.from({ length: 3 }, (_, index) => event('SENSITIVE_ENDPOINT', '198.51.100.7', now - index,
        { detail: { classification: 'SENSITIVE_PATH_REQUEST' }, route_group: `/.env-${index}` })),
    ];
    expect(observation.summarize(events, now)[0].recommendations).toEqual([
      'INDEFINITE_AUTH_ABUSE', 'TEMP_1H_RATE_LIMIT', 'ROUTE_SCAN_DETECTED', 'TEMP_1H_SENSITIVE_SCAN',
    ]);
  });

  it('no mezcla un usuario inexistente aislado con fallos de cuentas conocidas', () => {
    const now = 21_000_000;
    const events = [
      ...Array.from({ length: 9 }, (_, index) => event('AUTH_FAILURE', '198.51.100.8', now - index,
        { identity_hash: 'known', user_id: 'known-user' })),
      event('AUTH_FAILURE', '198.51.100.8', now - 20, { identity_hash: 'unknown' }),
    ];
    const source = observation.summarize(events, now)[0];
    expect(source.recommendations).not.toContain('INDEFINITE_AUTH_ABUSE');
    expect(source.authInterpretation).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('diez intentos con identidades inexistentes se consideran ataque automatizado', () => {
    const now = 22_000_000;
    const events = Array.from({ length: 10 }, (_, index) => event('AUTH_FAILURE', '198.51.100.9', now - index,
      { identity_hash: `unknown-${index}` }));
    const source = observation.summarize(events, now)[0];
    expect(source.authInterpretation).toBe('AUTOMATED_UNKNOWN_IDENTITIES');
    expect(source.recommendations).toContain('INDEFINITE_AUTH_ABUSE');
  });

  it('detecta una cuenta que vuelve a bloquearse después de ser recuperada', () => {
    const now = 22_500_000;
    const events = [
      event('ACCOUNT_RECOVERY', '198.51.100.15', now - 1000, { user_id: 'user-1' }),
      event('AUTH_FAILURE', '198.51.100.15', now - 500, { user_id: 'user-1',
        identity_hash: 'known', detail: { reason: 'locked' } }),
    ];
    const source = observation.summarize(events, now)[0];
    expect(source.authInterpretation).toBe('RELOCKED_AFTER_RECOVERY');
    expect(source.recommendations).toContain('INDEFINITE_POST_UNLOCK_ATTACK');
  });

  it('ignora 429 ajenos a autenticación para la escalada de acceso', () => {
    const now = 23_000_000;
    const events = Array.from({ length: 30 }, (_, index) => event('RATE_LIMITED', '198.51.100.10', now - index,
      { detail: { flow: 'AI_ANALYSIS' } }));
    expect(observation.summarize(events, now)[0].rateLimited10m).toBe(0);
  });

  it('no bloquea por errores aislados en endpoints sensibles legítimos', () => {
    const now = 24_000_000;
    const events = Array.from({ length: 3 }, (_, index) => event('SENSITIVE_ENDPOINT',
      '198.51.100.12', now - index, { detail: { classification: 'INVALID_RECOVERY_TOKEN' },
        route_group: '/api/auth/password-reset/confirm' }));
    expect(observation.summarize(events, now)[0].recommendations)
      .not.toContain('TEMP_1H_SENSITIVE_SCAN');
  });

  it.each([
    [401, 'UNAUTHENTICATED', 'NO_OR_INVALID_SESSION'],
    [403, 'FORBIDDEN', 'INSUFFICIENT_PERMISSION'],
    [404, 'API_NOT_FOUND', 'UNKNOWN_API_ROUTE'],
    [429, 'RATE_LIMITED', 'RATE_LIMIT_EXCEEDED'],
  ])('registra respuesta %s con clasificación segura', async (statusCode, eventType, classification) => {
    let finish;
    const req = { path: '/api/private/resource', originalUrl: '/api/private/resource?token=secret',
      method: 'GET', ip: '198.51.100.7', account: statusCode === 403 ? { sub: 'user-1' } : null };
    const res = { statusCode, on: vi.fn((_event, callback) => { finish = callback; }) };
    observation.observeRequests(req, res, vi.fn());
    finish();
    await vi.waitFor(() => expect(require('../../db/repos/webSecurityEventRepo').record)
      .toHaveBeenCalledWith(expect.objectContaining({ eventType, sourceIp: '198.51.100.7',
        routeGroup: '/api/private/resource', statusCode,
        detail: expect.objectContaining({ classification }) })));
  });

  it('evita duplicar el 401 de login que sessionBridge registra con identidad', () => {
    let finish;
    const req = { path: '/api/account/login', originalUrl: '/api/account/login', method: 'POST',
      ip: '198.51.100.7' };
    const res = { statusCode: 401, on: vi.fn((_event, callback) => { finish = callback; }) };
    const repo = require('../../db/repos/webSecurityEventRepo');
    repo.record.mockClear();
    observation.observeRequests(req, res, vi.fn());
    finish();
    expect(repo.record).not.toHaveBeenCalled();
  });

  it('audita un 404 legítimo sin contarlo como escaneo de ruta', async () => {
    let finish;
    const req = { path: '/api/nodes/:id', originalUrl: '/api/nodes/12345', method: 'GET',
      ip: '198.51.100.7', route: { path: '/:id' } };
    const res = { statusCode: 404, on: vi.fn((_event, callback) => { finish = callback; }) };
    const repo = require('../../db/repos/webSecurityEventRepo');
    observation.observeRequests(req, res, vi.fn());
    finish();
    await vi.waitFor(() => expect(repo.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'RESOURCE_NOT_FOUND', detail: {
        classification: 'KNOWN_ROUTE_MISSING_RESOURCE',
      },
    })));
  });

  it('clasifica un token de recuperación inválido sin registrar su contenido', async () => {
    let finish;
    const req = { path: '/api/auth/password-reset/confirm', originalUrl: '/api/auth/password-reset/confirm',
      method: 'POST', ip: '198.51.100.11' };
    const res = { statusCode: 401, on: vi.fn((_event, callback) => { finish = callback; }) };
    const repo = require('../../db/repos/webSecurityEventRepo');
    observation.observeRequests(req, res, vi.fn());
    finish();
    await vi.waitFor(() => expect(repo.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'SENSITIVE_ENDPOINT', detail: { classification: 'INVALID_RECOVERY_TOKEN' },
    })));
  });
});
