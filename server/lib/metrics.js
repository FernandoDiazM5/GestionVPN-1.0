// ============================================================
//  Métricas Prometheus (FASE 9 del REFACTOR_PLAN)
//
//  Registry singleton + counters/histograms del backend.
//  Expuestos por GET /metrics (router montado en server/index.js).
//
//  Convención de nombres: snake_case + sufijo de unidad
//  (_total para counters, _seconds para histogramas de tiempo)
//  → respeta best practices oficiales de Prometheus.
//
//  Uso desde otros módulos:
//    const m = require('./lib/metrics');
//    m.authFailsTotal.inc({ reason: 'bad_password' });
//    m.routerosErrorsTotal.inc({ type: 'timeout' });
//    m.mailSentTotal.inc({ kind: 'otp', status: 'ok' });
//
//  El middleware HTTP vive en server/index.js (mide latencia y
//  contabiliza requests por método/ruta/status).
// ============================================================

const client = require('prom-client');

// Registry dedicado (no usamos el global del paquete para no
// interferir con tests que lo monten en otro proceso).
const register = new client.Registry();

// Etiqueta global: identifica el servicio en un scrape multi-servicio.
register.setDefaultLabels({ service: 'gestionvpn-backend' });

// Métricas por defecto de Node.js (CPU, memoria, event loop lag, GC).
// Útil para detectar leaks y saturación sin escribir más código.
client.collectDefaultMetrics({ register, prefix: 'nodejs_' });

// ── HTTP ─────────────────────────────────────────────────────────────────────
//  Etiquetas mínimas (method, route, status) para evitar explosión de
//  cardinalidad. La ruta se normaliza a req.route.path cuando Express la
//  expone (ej. /api/team/member/:id); si no, se cae al pathname crudo
//  sin query string.

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Cantidad total de requests HTTP recibidos.',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Latencia de respuestas HTTP en segundos.',
    labelNames: ['method', 'route', 'status'],
    // Buckets pensados para una API JSON: 1ms → 5s.
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
});

// ── Auth ────────────────────────────────────────────────────────────────────
//  Granularidad por motivo, no por usuario (evita PII y cardinalidad).
//  Motivos usados hoy: bad_password, unknown_user, disabled, rate_limited,
//  bad_otp, expired_token, invalid_token.

const authFailsTotal = new client.Counter({
    name: 'auth_fails_total',
    help: 'Fallos de autenticación o sesión.',
    labelNames: ['reason'],
    registers: [register],
});

// ── RouterOS ────────────────────────────────────────────────────────────────
//  Errores categorizados (timeout, refused, login, network, unknown).
//  Se incrementa desde routeros.service.js en el catch de safeWrite y
//  connectToMikrotik. !empty NO cuenta — es un resultado válido vacío.

const routerosErrorsTotal = new client.Counter({
    name: 'routeros_errors_total',
    help: 'Errores devueltos por RouterOS API o por la conexión TCP.',
    labelNames: ['type'],
    registers: [register],
});

// Counter de escrituras OK — útil para ratio errores/total y para deducir
// si el router está mudo (no llegan writes) vs caído (llegan + fallan).
const routerosWritesTotal = new client.Counter({
    name: 'routeros_writes_total',
    help: 'Escrituras a RouterOS finalizadas (ok o error).',
    labelNames: ['status'],
    registers: [register],
});

// ── Mailer ──────────────────────────────────────────────────────────────────
//  status: ok | error | dev (sin SMTP configurado, log en consola)
//  kind: otp | invitation | password_reset

const mailSentTotal = new client.Counter({
    name: 'mail_sent_total',
    help: 'Correos procesados por el mailer (incluye modo DEV sin SMTP).',
    labelNames: ['kind', 'status'],
    registers: [register],
});

module.exports = {
    register,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    authFailsTotal,
    routerosErrorsTotal,
    routerosWritesTotal,
    mailSentTotal,
};
