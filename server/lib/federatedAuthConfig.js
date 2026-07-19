const PROVIDER = 'firebase';
const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const PROJECT_ID_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

function positiveInt(value, fallback, min, max, label) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} debe estar entre ${min} y ${max}`);
  }
  return parsed;
}

function readFederatedAuthConfig(env = process.env) {
  const enabled = env.FEDERATED_AUTH_ENABLED === 'true';
  if (!enabled) {
    return Object.freeze({ enabled: false, provider: PROVIDER });
  }

  const provider = String(env.FEDERATED_AUTH_PROVIDER || PROVIDER).trim().toLowerCase();
  if (provider !== PROVIDER) throw new Error('FEDERATED_AUTH_PROVIDER no soportado');

  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  if (!PROJECT_ID_RE.test(projectId)) {
    throw new Error('FIREBASE_PROJECT_ID es obligatorio y debe ser válido');
  }

  const tenantId = String(env.FIREBASE_TENANT_ID || '').trim();
  if (tenantId && !ID_RE.test(tenantId)) throw new Error('FIREBASE_TENANT_ID inválido');

  return Object.freeze({
    enabled: true,
    provider,
    projectId,
    tenantId: tenantId || null,
    tenantKey: tenantId || '',
    maxAuthAgeSeconds: positiveInt(
      env.FEDERATED_AUTH_MAX_AGE_SECONDS,
      300,
      60,
      900,
      'FEDERATED_AUTH_MAX_AGE_SECONDS',
    ),
  });
}

module.exports = { PROVIDER, readFederatedAuthConfig };
