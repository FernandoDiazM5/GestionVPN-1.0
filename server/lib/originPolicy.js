const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

function normalizeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error(`CORS_ORIGINS contiene un origen inválido: ${value}`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error(`CORS_ORIGINS sólo acepta orígenes sin ruta: ${value}`);
  }
  return parsed.origin;
}

function readAllowedOrigins(env = process.env) {
  const configuredOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  if (env.NODE_ENV === 'production') {
    if (configuredOrigins.length === 0) {
      throw new Error('CORS_ORIGINS es obligatorio en producción');
    }
    if (configuredOrigins.some(origin => !origin.startsWith('https://'))) {
      throw new Error('CORS_ORIGINS debe usar exclusivamente HTTPS en producción');
    }
  }

  return [...new Set(env.NODE_ENV === 'production'
    ? configuredOrigins
    : [...configuredOrigins, ...DEV_ORIGINS])];
}

const allowedOrigins = Object.freeze(readAllowedOrigins());

function isAllowedOrigin(origin) {
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

module.exports = { allowedOrigins, isAllowedOrigin, readAllowedOrigins };
