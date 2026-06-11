// ============================================================
//  lib/dashboardMetrics.js — agregador del registry prom-client (Q2)
//
//  Lee el registry interno (objeto en memoria, no GET /metrics), suma
//  los contadores por label y calcula percentiles p50/p95/p99 desde
//  el histograma HTTP. Mantiene además un buffer circular con un
//  snapshot por minuto (60 puntos = 1h de histórico para sparklines).
//
//  No persiste: si el backend reinicia, el histórico se pierde — es
//  consistente con la naturaleza in-memory de prom-client. Para
//  histórico real hay que scrapear /metrics desde Prometheus.
// ============================================================
const metrics = require('./metrics');
const logger = require('./logger').child({ scope: 'dashboard-metrics' });

const HISTORY_MAX = 60;                       // 1 muestra cada 60s → 1h
const SAMPLE_INTERVAL_MS = 60_000;

const _history = [];                          // buffer circular FIFO
let _handle = null;
let _startedAt = Date.now();

/**
 * Helper: suma los `.value` de un counter sumando opcionalmente por una
 * etiqueta determinada — devuelve { total, byLabel }.
 *
 * counter.get() devuelve { values: [{ value, labels }, ...] }
 * agregamos por la etiqueta solicitada (ej. 'reason' para auth_fails).
 */
async function aggregateCounter(counter, labelName) {
  const data = await counter.get();
  const byLabel = {};
  let total = 0;
  for (const v of data.values || []) {
    total += Number(v.value) || 0;
    if (labelName && v.labels && v.labels[labelName] != null) {
      const key = String(v.labels[labelName]);
      byLabel[key] = (byLabel[key] || 0) + (Number(v.value) || 0);
    }
  }
  return { total, byLabel };
}

/**
 * Calcula percentiles desde el histograma HTTP. El histograma de prom-client
 * expone `*_bucket` (acumulativo), `*_sum` y `*_count`. Hacemos interpolación
 * lineal dentro del bucket donde cae el percentil — buena aproximación para
 * dashboards (no para SLO billing).
 */
async function httpLatencyPercentiles() {
  const data = await metrics.httpRequestDurationSeconds.get();
  // Acumular buckets agregados sobre TODAS las etiquetas (method/route/status).
  // Cada item es { metricName, labels: { le: '0.01', method, route, status }, value }.
  // Sumamos por `le` para no pivotear etiqueta por etiqueta.
  const buckets = new Map();   // le → cumulative count
  let totalCount = 0;
  for (const v of data.values || []) {
    if (v.metricName && v.metricName.endsWith('_bucket') && v.labels && v.labels.le != null) {
      const le = v.labels.le;
      buckets.set(le, (buckets.get(le) || 0) + (Number(v.value) || 0));
    }
    if (v.metricName && v.metricName.endsWith('_count')) {
      totalCount += Number(v.value) || 0;
    }
  }
  if (totalCount === 0) return { p50: 0, p95: 0, p99: 0 };

  // ORDENAR por le numérico (las claves vienen como strings, "+Inf" al final).
  const sorted = [...buckets.entries()].sort((a, b) => {
    const na = a[0] === '+Inf' ? Infinity : Number(a[0]);
    const nb = b[0] === '+Inf' ? Infinity : Number(b[0]);
    return na - nb;
  });

  function quantile(q) {
    const target = q * totalCount;
    let prevLe = 0;
    let prevCount = 0;
    for (const [le, cum] of sorted) {
      const leNum = le === '+Inf' ? Infinity : Number(le);
      if (cum >= target) {
        if (leNum === Infinity) return prevLe; // sobre el último bucket finito
        const bucketCount = cum - prevCount;
        if (bucketCount === 0) return leNum;
        // Interpolación lineal entre prevLe y leNum.
        const frac = (target - prevCount) / bucketCount;
        return prevLe + (leNum - prevLe) * frac;
      }
      prevLe = leNum === Infinity ? prevLe : leNum;
      prevCount = cum;
    }
    return prevLe;
  }

  return { p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99) };
}

/**
 * Snapshot completo del estado actual del registry.
 * Es lo que sirve el endpoint GET /api/dashboard/metrics como `current`.
 */
async function snapshot() {
  const [httpReqs, authFails, rosErr, rosWrites, mail] = await Promise.all([
    aggregateCounter(metrics.httpRequestsTotal, 'status'),
    aggregateCounter(metrics.authFailsTotal, 'reason'),
    aggregateCounter(metrics.routerosErrorsTotal, 'type'),
    aggregateCounter(metrics.routerosWritesTotal, 'status'),
    aggregateCounter(metrics.mailSentTotal, 'kind'),
  ]);
  const percentiles = await httpLatencyPercentiles();

  // 5xx total: la etiqueta 'status' viene como string "500", "503", etc.
  const httpErrors = Object.entries(httpReqs.byLabel)
    .filter(([k]) => /^5\d\d$/.test(k))
    .reduce((sum, [, v]) => sum + v, 0);

  const rosOkRatio = rosWrites.total > 0
    ? (rosWrites.byLabel.ok || 0) / rosWrites.total
    : 1;

  return {
    httpRequests: httpReqs.total,
    httpErrors,
    authFails: authFails.total,
    authFailsByReason: authFails.byLabel,
    routerosErrors: rosErr.total,
    routerosErrorsByType: rosErr.byLabel,
    routerosWrites: rosWrites.total,
    routerosOkRatio: Number(rosOkRatio.toFixed(4)),
    mailSent: mail.total,
    mailByKind: mail.byLabel,
    latencyP50s: Number(percentiles.p50.toFixed(4)),
    latencyP95s: Number(percentiles.p95.toFixed(4)),
    latencyP99s: Number(percentiles.p99.toFixed(4)),
    uptimeMs: Date.now() - _startedAt,
  };
}

async function takeSample() {
  try {
    const s = await snapshot();
    _history.push({
      ts: Date.now(),
      httpRequests: s.httpRequests,
      httpErrors: s.httpErrors,
      authFails: s.authFails,
      routerosErrors: s.routerosErrors,
      routerosWrites: s.routerosWrites,
      latencyP95s: s.latencyP95s,
    });
    while (_history.length > HISTORY_MAX) _history.shift();
  } catch (err) {
    logger.warn({ err: err.message }, 'snapshot falló (continúa)');
  }
}

function start() {
  if (_handle) return;
  _startedAt = Date.now();
  // Toma una muestra al iniciar para que el histórico no esté vacío
  // hasta el primer tick. Las siguientes son cada SAMPLE_INTERVAL_MS.
  void takeSample();
  _handle = setInterval(takeSample, SAMPLE_INTERVAL_MS);
  logger.info({ intervalMs: SAMPLE_INTERVAL_MS, historyMax: HISTORY_MAX }, 'dashboard metrics sampler iniciado');
}

function stop() {
  if (_handle) { clearInterval(_handle); _handle = null; }
}

function history() {
  return _history.slice();
}

module.exports = { snapshot, history, start, stop, takeSample, SAMPLE_INTERVAL_MS, HISTORY_MAX };
