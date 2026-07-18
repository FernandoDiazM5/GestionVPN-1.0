const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  throw new Error('CORS_ORIGINS es obligatorio en producción');
}

const allowedOrigins = Object.freeze([
  ...new Set(process.env.NODE_ENV === 'production'
    ? configuredOrigins
    : [...configuredOrigins, ...DEV_ORIGINS]),
]);

function isAllowedOrigin(origin) {
  return typeof origin === 'string' && allowedOrigins.includes(origin);
}

module.exports = { allowedOrigins, isAllowedOrigin };
