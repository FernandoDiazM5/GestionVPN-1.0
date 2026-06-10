// ============================================================
//  Rutas de salud / diagnóstico
//  GET /api/health     → snapshot de los 3 sistemas críticos (F9)
//  GET /api/health/db  → ping mínimo a MySQL (legacy, mantenido)
//
//  Sin auth: pensado para monitoring externo y consumo por liveness probes.
//  pino-http silencia este prefijo para no inundar logs.
// ============================================================
const express = require('express');
const { ping: pingMysql } = require('../db/mysql');
const { verifySmtp } = require('../lib/mailer');
const { getLastSafeWriteOkAt } = require('../routeros.service');
const { sendOk, asyncHandler } = require('../lib/apiResponse');

const router = express.Router();

const BOOT_AT = Date.now();
const VERSION = (() => {
  try { return require('../package.json').version; } catch { return 'unknown'; }
})();

// Umbrales (segundos) que separan ok / stale / down para RouterOS.
// Coinciden con el ritmo típico de keepalive del módulo de túnel multi-usuario.
const ROUTEROS_OK_MAX_S = Number(process.env.HEALTH_ROUTEROS_OK_MAX_S || 60);
const ROUTEROS_STALE_MAX_S = Number(process.env.HEALTH_ROUTEROS_STALE_MAX_S || 300);

async function checkMysql() {
  const start = process.hrtime.bigint();
  try {
    await pingMysql();
    const latency_ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    return { status: 'ok', latency_ms };
  } catch (err) {
    const latency_ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    return { status: 'down', latency_ms, error: err?.code || err?.message || 'unknown' };
  }
}

function checkRouterOs() {
  const last = getLastSafeWriteOkAt();
  if (!last) return { status: 'unknown', last_write_ago_s: null };
  const ago = Math.round((Date.now() - last) / 1000);
  let status;
  if (ago <= ROUTEROS_OK_MAX_S) status = 'ok';
  else if (ago <= ROUTEROS_STALE_MAX_S) status = 'stale';
  else status = 'down';
  return { status, last_write_ago_s: ago };
}

// El status global degrada en cascada:
//   ok       → todo verde
//   degraded → algún check no está OK pero el servicio sigue arriba
//   down     → MySQL caído (sin BD, prácticamente nada funciona)
function overallStatus(checks) {
  if (checks.mysql.status === 'down') return 'down';
  const anyBad = ['routeros', 'smtp'].some(k => {
    const s = checks[k].status;
    return s === 'down' || s === 'stale' || s === 'error';
  });
  return anyBad ? 'degraded' : 'ok';
}

// GET /api/health → snapshot completo
router.get('/', asyncHandler(async (_req, res) => {
  const [mysql, smtp] = await Promise.all([checkMysql(), verifySmtp()]);
  const routeros = checkRouterOs();
  const checks = { mysql, routeros, smtp };
  const status = overallStatus(checks);
  const body = {
    status,
    version: VERSION,
    uptime_s: Math.round((Date.now() - BOOT_AT) / 1000),
    checks,
  };
  // Si algo está down devolvemos 503 para que Kubernetes/uptime-kuma lo
  // marquen como unhealthy. degraded sigue siendo 200 (servicio responde).
  if (status === 'down') return res.status(503).json({ success: false, ...body });
  return sendOk(res, body);
}));

// GET /api/health/db → legacy, ping mínimo a MySQL
router.get('/db', asyncHandler(async (_req, res) => {
  await pingMysql();
  return sendOk(res, { db: 'mysql', status: 'online' });
}));

module.exports = router;
