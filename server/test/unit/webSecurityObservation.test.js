const { stubModule } = require('../helpers/moduleMock');

stubModule(__dirname, '../../db/repos/webSecurityEventRepo', {
  record: vi.fn(), listRecent: vi.fn(), purgeOlderThan: vi.fn(),
});
stubModule(__dirname, '../../lib/rateLimit', {
  bucketHash: vi.fn((_scope, value) => `hash:${value}`),
  clientIp: vi.fn(req => req.ip),
});

const observation = require('../../lib/webSecurityObservation');

const event = (type, ip, at, extra = {}) => ({ event_type: type, source_ip: ip,
  occurred_at: at, identity_hash: null, user_id: null, route_group: null, ...extra });

describe('observacion pasiva de seguridad web', () => {
  beforeEach(() => {
    require('../../db/repos/webSecurityEventRepo').record.mockResolvedValue(undefined);
  });

  it('conserva incidentes durante 90 días', () => {
    expect(observation.RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
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
      ...Array.from({ length: 20 }, (_, index) => event('RATE_LIMITED', '198.51.100.7', now - index)),
      ...Array.from({ length: 30 }, (_, index) => event('API_NOT_FOUND', '198.51.100.7', now - index,
        { route_group: `/scan/${index % 10}` })),
      ...Array.from({ length: 3 }, (_, index) => event('SENSITIVE_ENDPOINT', '198.51.100.7', now - index)),
    ];
    expect(observation.summarize(events, now)[0].recommendations).toEqual([
      'INDEFINITE_AUTH_ABUSE', 'TEMP_1H_RATE_LIMIT', 'TEMP_1H_ROUTE_SCAN', 'TEMP_1H_SENSITIVE_SCAN',
    ]);
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
});
