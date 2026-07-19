const { readFederatedAuthConfig } = require('../../lib/federatedAuthConfig');

const KEYS = [
  'FEDERATED_AUTH_ENABLED',
  'FEDERATED_AUTH_PROVIDER',
  'FEDERATED_AUTH_MAX_AGE_SECONDS',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_TENANT_ID',
];
const original = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('federatedAuthConfig', () => {
  it('queda deshabilitado por defecto sin exigir credenciales', () => {
    for (const key of KEYS) delete process.env[key];
    expect(readFederatedAuthConfig()).toEqual({ enabled: false, provider: 'firebase' });
  });

  it('valida y normaliza la configuracion del piloto', () => {
    process.env.FEDERATED_AUTH_ENABLED = 'true';
    process.env.FIREBASE_PROJECT_ID = 'gestion-vpn-pilot';
    process.env.FIREBASE_TENANT_ID = 'tenant_01';
    process.env.FEDERATED_AUTH_MAX_AGE_SECONDS = '180';
    expect(readFederatedAuthConfig()).toMatchObject({
      enabled: true,
      provider: 'firebase',
      projectId: 'gestion-vpn-pilot',
      tenantId: 'tenant_01',
      tenantKey: 'tenant_01',
      maxAuthAgeSeconds: 180,
    });
  });

  it('falla al habilitar sin proyecto o con edad insegura', () => {
    process.env.FEDERATED_AUTH_ENABLED = 'true';
    delete process.env.FIREBASE_PROJECT_ID;
    expect(() => readFederatedAuthConfig()).toThrow('FIREBASE_PROJECT_ID');

    process.env.FIREBASE_PROJECT_ID = 'gestion-vpn-pilot';
    process.env.FEDERATED_AUTH_MAX_AGE_SECONDS = '901';
    expect(() => readFederatedAuthConfig()).toThrow('FEDERATED_AUTH_MAX_AGE_SECONDS');
  });
});
