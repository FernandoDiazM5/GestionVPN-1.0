export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface FederatedAuthConfig {
  client: FirebaseWebConfig;
  tenantId: string | null;
}

type FirebaseClientEnv = Partial<Record<
  | 'VITE_FEDERATED_AUTH_ENABLED'
  | 'VITE_FIREBASE_API_KEY'
  | 'VITE_FIREBASE_AUTH_DOMAIN'
  | 'VITE_FIREBASE_PROJECT_ID'
  | 'VITE_FIREBASE_APP_ID'
  | 'VITE_FIREBASE_TENANT_ID',
  string
>>;

function value(env: FirebaseClientEnv, key: keyof FirebaseClientEnv): string {
  return String(env[key] || '').trim();
}

export function resolveFederatedAuthConfig(env: FirebaseClientEnv): FederatedAuthConfig | null {
  if (value(env, 'VITE_FEDERATED_AUTH_ENABLED') !== 'true') return null;

  const client = {
    apiKey: value(env, 'VITE_FIREBASE_API_KEY'),
    authDomain: value(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: value(env, 'VITE_FIREBASE_PROJECT_ID'),
    appId: value(env, 'VITE_FIREBASE_APP_ID'),
  };
  if (Object.values(client).some(item => !item)) return null;

  return {
    client,
    tenantId: value(env, 'VITE_FIREBASE_TENANT_ID') || null,
  };
}

export const federatedAuthConfig = resolveFederatedAuthConfig(
  import.meta.env as unknown as FirebaseClientEnv,
);
export const federatedAuthAvailable = federatedAuthConfig !== null;
