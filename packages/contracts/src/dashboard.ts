// ============================================================
//  Dashboard — métricas del backend en formato JSON (Q2)
//
//  El backend ya expone GET /metrics en formato Prometheus puro
//  (texto plano). Pero el dashboard del frontend no necesita un
//  scraper: necesita un JSON estable + un histórico en memoria
//  para dibujar sparklines.
//
//  Endpoint nuevo: GET /api/dashboard/metrics — agrega snapshot
//  del registry Prometheus y un buffer circular con los últimos
//  60 muestreos (1/min → 1 hora de histórico).
// ============================================================

/** Una muestra del buffer circular (1 cada SAMPLE_INTERVAL_MS). */
export interface DashboardSample {
  /** epoch ms */
  ts: number;
  /** total acumulado de http_requests_total al momento del snapshot */
  httpRequests: number;
  /** errores 5xx acumulados */
  httpErrors: number;
  /** auth_fails_total acumulado */
  authFails: number;
  /** routeros_errors_total acumulado */
  routerosErrors: number;
  /** routeros_writes_total acumulado (todos status) */
  routerosWrites: number;
  /** latencia p95 calculada sobre el histograma (segundos) */
  latencyP95s: number;
}

/** Respuesta de GET /api/dashboard/metrics. */
export interface DashboardMetricsResponse {
  success: true;
  /** Snapshot ACTUAL — totales acumulados, no derivadas. */
  current: {
    httpRequests: number;
    httpErrors: number;
    authFails: number;
    authFailsByReason: Record<string, number>;
    routerosErrors: number;
    routerosErrorsByType: Record<string, number>;
    routerosWrites: number;
    routerosOkRatio: number;            // 0..1 (writes ok / writes total)
    mailSent: number;
    mailByKind: Record<string, number>;
    /** Latencia HTTP (todos los endpoints). */
    latencyP50s: number;
    latencyP95s: number;
    latencyP99s: number;
    /** ms desde el último restart del backend (process.uptime() en ms). */
    uptimeMs: number;
  };
  /** Últimos 60 puntos (cuando hay datos). El frontend dibuja sparklines. */
  history: DashboardSample[];
}
