// ============================================================
//  routes/diagnostics.routes.js — ping / traceroute desde el router (Q3)
//
//  Endpoints:
//    POST /api/diagnostics/ping         { target, count? }
//    POST /api/diagnostics/traceroute   { target }
//
//  Se ejecuta /tool/ping y /tool/traceroute en el MikroTik (no en el
//  servidor): así el path de red coincide con el que usan los túneles
//  reales, lo cual hace el diagnóstico útil para soporte.
//
//  Seguridad:
//   • Inputs validados con Zod (target = IPv4 o hostname).
//   • Mismas guardas multi-tenant que el resto: workspace_id del
//     usuario se aplica via verifyToken (req.mikrotik se inyecta solo
//     si el usuario tiene acceso al router del workspace).
//   • Rate limit BÁSICO en memoria: máx 5 requests cada 10s por
//     usuario para evitar abuso. Ataques DDoS reales se mitigan en
//     el router con address-list, no acá.
//   • Si el target es una IP pública, el comando sale a Internet
//     desde el router — comportamiento esperado (es lo que necesita
//     el operador para diagnosticar "¿se ve Google desde el core?").
// ============================================================
const express = require('express');
const router = express.Router();

const { connectToMikrotik, safeWrite, getErrorMessage } = require('../routeros.service');
const { asyncHandler, AppError, sendOk } = require('../lib/apiResponse');
const {
  DiagnosticsPingRequestSchema,
  DiagnosticsTraceRequestSchema,
} = require('@gestionvpn/contracts');
const log = require('../lib/logger').child({ scope: 'diagnostics' });

// ── Rate limit en memoria por user_id ─────────────────────────────
const RL_WINDOW_MS = 10_000;
const RL_MAX = 5;
const _hits = new Map(); // userId → number[] (timestamps)

function rateLimit(userId) {
  const now = Date.now();
  const arr = (_hits.get(userId) || []).filter(t => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_MAX) return false;
  arr.push(now);
  _hits.set(userId, arr);
  return true;
}

// ── Parsers de RouterOS ───────────────────────────────────────────
// /tool/ping devuelve filas como:
//   { ".id":..., "seq": "0", "host": "192.168.50.1", "size": "56",
//     "ttl": "63", "time": "12ms" }
// o ante timeout:
//   { "seq": "1", "status": "timeout" }
function parseMs(s) {
  if (!s) return null;
  const m = String(s).match(/^([\d.]+)\s*ms?/);
  return m ? Number(m[1]) : null;
}

function summarize(rows) {
  const sent = rows.length;
  const received = rows.filter(r => r.status !== 'timeout' && parseMs(r.time) !== null).length;
  const times = rows.map(r => parseMs(r.time)).filter(t => t !== null);
  return {
    sent,
    received,
    lossPct: sent ? Math.round(((sent - received) / sent) * 100) : 0,
    minMs: times.length ? Math.min(...times) : null,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    maxMs: times.length ? Math.max(...times) : null,
  };
}

// ── POST /diagnostics/ping ────────────────────────────────────────
router.post('/diagnostics/ping', asyncHandler(async (req, res) => {
  if (!req.mikrotik) throw new AppError('Configura las credenciales MikroTik en Ajustes.', 503, 'NEEDS_CONFIG');
  if (!req.account?.sub) throw new AppError('Sesión inválida', 401, 'NO_SESSION');
  if (!rateLimit(req.account.sub)) {
    throw new AppError('Demasiados diagnósticos seguidos. Espera unos segundos.', 429, 'RATE_LIMITED');
  }

  const { target, count = 4 } = DiagnosticsPingRequestSchema.parse(req.body);
  const { ip, user, pass } = req.mikrotik;

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    // /tool/ping con count fijo termina solo. interval default 1s → ~count segundos.
    const rows = await safeWrite(api, [
      '/tool/ping',
      `=address=${target}`,
      `=count=${count}`,
    ], (count + 2) * 1000);
    await api.close().catch(() => {});

    const normalizedRows = rows.map(r => ({
      seq: Number(r.seq) || 0,
      host: r.host,
      time: r.time,
      size: r.size ? Number(r.size) : undefined,
      ttl: r.ttl ? Number(r.ttl) : undefined,
      status: r.status,
    }));

    log.info({ userId: req.account.sub, target, sent: normalizedRows.length }, 'diagnostics/ping');

    return sendOk(res, {
      target,
      rows: normalizedRows,
      summary: summarize(rows),
    });
  } catch (err) {
    if (api) try { await api.close(); } catch (_) {}
    throw new AppError(getErrorMessage(err, ip, user), 500, 'PING_FAILED');
  }
}));

// ── POST /diagnostics/traceroute ──────────────────────────────────
// RouterOS responde con MUCHAS filas (una por probe). Cada fila trae el
// hop incremental ("8" / "9" / ...) y un set de "address-N", "rtt-N",
// "loss-N", "status-N". Tomamos la última fila con el hop más alto
// porque RouterOS acumula resultados; agrupamos por hop.
//
// /tool/traceroute count=1 timeout=2s — termina solo cuando alcanza el
// target o llega al hop 30 (default).
router.post('/diagnostics/traceroute', asyncHandler(async (req, res) => {
  if (!req.mikrotik) throw new AppError('Configura las credenciales MikroTik en Ajustes.', 503, 'NEEDS_CONFIG');
  if (!req.account?.sub) throw new AppError('Sesión inválida', 401, 'NO_SESSION');
  if (!rateLimit(req.account.sub)) {
    throw new AppError('Demasiados diagnósticos seguidos. Espera unos segundos.', 429, 'RATE_LIMITED');
  }

  const { target } = DiagnosticsTraceRequestSchema.parse(req.body);
  const { ip, user, pass } = req.mikrotik;

  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const rows = await safeWrite(api, [
      '/tool/traceroute',
      `=address=${target}`,
      '=count=1',
      '=timeout=2s',
      '=max-hops=20',
    ], 50_000);
    await api.close().catch(() => {});

    // Agrupar por hop: la última fila con cada número manda (RouterOS
    // emite filas progresivas hasta que el comando termina).
    const byHop = new Map();
    for (const r of rows) {
      // Cada fila trae hop X; address-X, rtt-X, loss-X, status-X.
      // El parser extrae el más reciente para cada hop.
      for (const key of Object.keys(r)) {
        const m = key.match(/^address-(\d+)$/);
        if (!m) continue;
        const hop = Number(m[1]);
        const entry = byHop.get(hop) || { hop, address: null, rttMs: null, lossPct: null, status: undefined };
        entry.address = r[`address-${hop}`] || entry.address;
        entry.rttMs = parseMs(r[`rtt-${hop}`]) ?? entry.rttMs;
        if (r[`loss-${hop}`] != null) entry.lossPct = Number(r[`loss-${hop}`]);
        if (r[`status-${hop}`]) entry.status = r[`status-${hop}`];
        byHop.set(hop, entry);
      }
    }

    const hops = Array.from(byHop.values()).sort((a, b) => a.hop - b.hop);

    log.info({ userId: req.account.sub, target, hops: hops.length }, 'diagnostics/traceroute');

    return sendOk(res, { target, hops });
  } catch (err) {
    if (api) try { await api.close(); } catch (_) {}
    throw new AppError(getErrorMessage(err, ip, user), 500, 'TRACE_FAILED');
  }
}));

module.exports = router;
