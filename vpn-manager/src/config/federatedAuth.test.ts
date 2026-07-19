import { describe, expect, it } from 'vitest';
import { resolveFederatedAuthConfig } from './federatedAuth';

describe('resolveFederatedAuthConfig', () => {
  it('permanece deshabilitado por defecto o si falta configuración', () => {
    expect(resolveFederatedAuthConfig({})).toBeNull();
    expect(resolveFederatedAuthConfig({
      VITE_FEDERATED_AUTH_ENABLED: 'true',
      VITE_FIREBASE_PROJECT_ID: 'gestion-vpn-pilot',
    })).toBeNull();
  });

  it('acepta exclusivamente una configuración completa y normalizada', () => {
    expect(resolveFederatedAuthConfig({
      VITE_FEDERATED_AUTH_ENABLED: 'true',
      VITE_FIREBASE_API_KEY: ' public-api-key ',
      VITE_FIREBASE_AUTH_DOMAIN: 'gestion-vpn-pilot.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'gestion-vpn-pilot',
      VITE_FIREBASE_APP_ID: '1:123:web:abc',
      VITE_FIREBASE_TENANT_ID: ' tenant-1 ',
    })).toEqual({
      client: {
        apiKey: 'public-api-key',
        authDomain: 'gestion-vpn-pilot.firebaseapp.com',
        projectId: 'gestion-vpn-pilot',
        appId: '1:123:web:abc',
      },
      tenantId: 'tenant-1',
    });
  });
});
