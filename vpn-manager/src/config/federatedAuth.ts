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

let runtimeConfigPromise: Promise<FederatedAuthConfig | null> | null = null;
export function getFederatedAuthConfig(): Promise<FederatedAuthConfig | null> {
  if (runtimeConfigPromise) return runtimeConfigPromise;
  runtimeConfigPromise = fetch('/api/account/federated/config', { credentials: 'include', cache: 'no-store' })
    .then(async response => {
      if (!response.ok) return federatedAuthConfig;
      const body = await response.json() as { enabled?: boolean; config?: FirebaseWebConfig & { tenantId?: string | null } };
      if (!body.enabled || !body.config) return federatedAuthConfig;
      return { client: { apiKey: body.config.apiKey, authDomain: body.config.authDomain, projectId: body.config.projectId, appId: body.config.appId }, tenantId: body.config.tenantId || null };
    })
    .catch(() => federatedAuthConfig);
  return runtimeConfigPromise;
}
