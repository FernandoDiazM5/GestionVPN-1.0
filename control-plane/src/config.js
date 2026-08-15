'use strict';

function required(value, name, minLength = 1) {
  const normalized = String(value || '').trim();
  if (normalized.length < minLength) throw new Error(`${name}_REQUIRED`);
  return normalized;
}

function loadConfig(env = process.env) {
  return {
    port: Number(env.CONTROL_PLANE_PORT || 3100),
    adminToken: required(env.CONTROL_PLANE_ADMIN_TOKEN, 'CONTROL_PLANE_ADMIN_TOKEN', 32),
    activationPepper: required(env.ACTIVATION_CODE_PEPPER, 'ACTIVATION_CODE_PEPPER', 32),
    rateLimitPepper: required(env.ACTIVATION_RATE_LIMIT_PEPPER, 'ACTIVATION_RATE_LIMIT_PEPPER', 32),
    signingKeyId: required(env.LICENSE_SIGNING_KEY_ID, 'LICENSE_SIGNING_KEY_ID', 3),
    signingPrivateKeyFile: required(env.LICENSE_SIGNING_PRIVATE_KEY_FILE, 'LICENSE_SIGNING_PRIVATE_KEY_FILE'),
    db: {
      host: required(env.CONTROL_DB_HOST, 'CONTROL_DB_HOST'),
      port: Number(env.CONTROL_DB_PORT || 3306),
      user: required(env.CONTROL_DB_USER, 'CONTROL_DB_USER'),
      password: required(env.CONTROL_DB_PASSWORD, 'CONTROL_DB_PASSWORD'),
      database: required(env.CONTROL_DB_NAME, 'CONTROL_DB_NAME'),
    },
  };
}

module.exports = { loadConfig };
