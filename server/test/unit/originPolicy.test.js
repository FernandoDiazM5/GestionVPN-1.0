const { readAllowedOrigins } = require('../../lib/originPolicy');

describe('originPolicy', () => {
  it('exige una lista explícita en producción', () => {
    expect(() => readAllowedOrigins({ NODE_ENV: 'production' }))
      .toThrow('CORS_ORIGINS es obligatorio');
  });

  it('normaliza y deduplica los dominios HTTPS productivos', () => {
    expect(readAllowedOrigins({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://joinpoint.cloud/, https://www.joinpoint.cloud,https://joinpoint.cloud',
    })).toEqual(['https://joinpoint.cloud', 'https://www.joinpoint.cloud']);
  });

  it('rechaza una configuración local o HTTP en producción', () => {
    expect(() => readAllowedOrigins({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'http://localhost:8080,http://127.0.0.1:8080',
    })).toThrow('exclusivamente HTTPS');
  });

  it('mantiene los orígenes locales seguros para desarrollo', () => {
    const origins = readAllowedOrigins({ NODE_ENV: 'development' });
    expect(origins).toContain('http://localhost:5173');
    expect(origins).toContain('http://127.0.0.1:8080');
  });
});
