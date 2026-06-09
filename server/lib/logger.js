// ============================================================
//  Logger estructurado (Fase 1 — REFACTOR_PLAN)
//
//  Reemplaza los console.* esparcidos por un logger pino con:
//    • Formato JSON en producción → ingesta directa por log shippers
//    • pino-pretty en desarrollo → legible en terminal
//    • Redact de campos sensibles (passwords, tokens, claves cifradas,
//      headers Authorization/Cookie)
//    • Niveles estandarizados (trace/debug/info/warn/error/fatal)
//
//  Uso típico desde otros módulos:
//
//    const logger = require('./lib/logger');
//    logger.info({ ip, user }, 'Conectando a MikroTik');
//    logger.warn({ err }, 'RouterOS no responde');
//
//  Child logger con scope (recomendado por módulo):
//
//    const log = require('./lib/logger').child({ scope: 'routeros' });
//    log.error({ err }, 'falló /print');
// ============================================================
const pino = require('pino');

const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

// ── Redact: paths que se sustituyen por "[REDACTED]" ────────────────
// Cubre nuestros campos sensibles + los headers HTTP que llevan secretos.
// Sintaxis: https://github.com/davidmarkclements/fast-redact
const redactPaths = [
  // — Body / payloads —
  'password', 'currentPassword', 'newPassword',
  'password_hash', 'passwordHash',
  'otp', 'otp_hash', 'otpHash',
  'token', 'tokenHash', 'token_hash',
  'secret', 'secret_key', 'secretKey',
  'privateKey', 'private_key',
  // — Credenciales cifradas en BD (no son legibles pero por defensa en profundidad) —
  'ppp_password_enc', 'pppPasswordEnc',
  'ssh_pass_enc', 'sshPassEnc',
  'clave_ssh_enc', 'claveSshEnc',
  'wifi_password_enc', 'wifiPasswordEnc',
  'config_enc', 'configEnc',
  'password_enc', 'passwordEnc',
  // — Recursiva: cualquier campo anidado con esos nombres —
  '*.password', '*.currentPassword', '*.newPassword',
  '*.password_hash', '*.passwordHash',
  '*.otp', '*.otp_hash', '*.otpHash',
  '*.token', '*.tokenHash', '*.token_hash',
  '*.secret', '*.secretKey',
  '*.privateKey', '*.private_key',
  '*.ppp_password_enc', '*.ssh_pass_enc', '*.clave_ssh_enc',
  '*.wifi_password_enc', '*.config_enc', '*.password_enc',
  // — Headers HTTP sensibles —
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'request.headers.authorization',
  'request.headers.cookie',
  'headers.authorization',
  'headers.cookie',
];

const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
        levelFirst: true,
      },
    }
  : undefined; // En prod: JSON crudo, lo más rápido posible

const logger = pino({
  level,
  base: {
    // Identificador de servicio para multi-app logging
    service: 'vpn-manager-backend',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
    remove: false, // mantiene la clave para que el shape sea consistente
  },
  // Mapeo de niveles a strings (más legible que números en logs JSON)
  formatters: {
    level: (label) => ({ level: label }),
  },
  transport,
});

// Convenciones de niveles (ver doc HANDOFF §Logs):
//   trace  → debug muy verboso (raw bytes RouterOS, dump SQL)
//   debug  → flujos internos (decisiones, paths tomados)
//   info   → eventos normales (login, invite enviado, mangle creada)
//   warn   → eventos recuperables (router timeout, retry, OTP malo)
//   error  → fallos que afectan al user (500, BD caída, hook crash)
//   fatal  → panic imposible de recuperar (port collision, secret missing)

module.exports = logger;
