// ============================================================
//  dashboardMetrics.test.js — aggregator + percentile (Q2)
//
//  No tocamos endpoints; ejercemos lib/dashboardMetrics directamente.
//  Importante: cada test resetea el registry para que las muestras de
//  un test no contaminen al siguiente.
// ============================================================
const metrics = require('../../lib/metrics');
const dashboardMetrics = require('../../lib/dashboardMetrics');

beforeEach(() => {
  metrics.register.resetMetrics();
});

afterAll(() => {
  dashboardMetrics.stop();
});

describe('snapshot — counters', () => {
  it('totales 0 cuando no hubo eventos', async () => {
    const s = await dashboardMetrics.snapshot();
    expect(s.httpRequests).toBe(0);
    expect(s.httpErrors).toBe(0);
    expect(s.authFails).toBe(0);
    expect(s.routerosErrors).toBe(0);
    expect(s.routerosWrites).toBe(0);
    expect(s.routerosOkRatio).toBe(1);          // sin writes → ratio "limpio"
    expect(s.mailSent).toBe(0);
  });

  it('suma httpRequests por etiqueta status y separa los 5xx', async () => {
    metrics.httpRequestsTotal.inc({ method: 'GET',  route: '/api/foo', status: '200' }, 5);
    metrics.httpRequestsTotal.inc({ method: 'GET',  route: '/api/foo', status: '404' }, 2);
    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/bar', status: '500' }, 3);
    metrics.httpRequestsTotal.inc({ method: 'POST', route: '/api/bar', status: '503' }, 1);

    const s = await dashboardMetrics.snapshot();
    expect(s.httpRequests).toBe(11);
    expect(s.httpErrors).toBe(4);              // 500 + 503
  });

  it('authFailsByReason agrupa correctamente', async () => {
    metrics.authFailsTotal.inc({ reason: 'bad_password' }, 3);
    metrics.authFailsTotal.inc({ reason: 'bad_password' }, 1);
    metrics.authFailsTotal.inc({ reason: 'rate_limited' }, 2);

    const s = await dashboardMetrics.snapshot();
    expect(s.authFails).toBe(6);
    expect(s.authFailsByReason).toEqual({ bad_password: 4, rate_limited: 2 });
  });

  it('routerosOkRatio = 1 si todos OK, 0.5 si la mitad falla', async () => {
    metrics.routerosWritesTotal.inc({ status: 'ok' }, 5);
    metrics.routerosWritesTotal.inc({ status: 'error' }, 5);
    const s = await dashboardMetrics.snapshot();
    expect(s.routerosWrites).toBe(10);
    expect(s.routerosOkRatio).toBe(0.5);
  });
});

describe('snapshot — percentiles del histograma HTTP', () => {
  it('sin observaciones → p50/p95/p99 = 0', async () => {
    const s = await dashboardMetrics.snapshot();
    expect(s.latencyP50s).toBe(0);
    expect(s.latencyP95s).toBe(0);
    expect(s.latencyP99s).toBe(0);
  });

  it('observaciones cortas (~1ms) caen en buckets bajos', async () => {
    // Buckets configurados: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, ...
    // 100 observaciones a 1ms (0.001s) deberían dar p50 cerca de 0.001.
    for (let i = 0; i < 100; i++) {
      metrics.httpRequestDurationSeconds.observe({ method: 'GET', route: '/api/x', status: '200' }, 0.001);
    }
    const s = await dashboardMetrics.snapshot();
    expect(s.latencyP50s).toBeGreaterThanOrEqual(0);
    expect(s.latencyP50s).toBeLessThan(0.005);
    expect(s.latencyP99s).toBeLessThan(0.005);
  });

  it('mezcla de latencias separa p50 y p95', async () => {
    // 90 obs a 10ms + 10 obs a 100ms → p95 debe interpolarse en el bucket [0.05, 0.1].
    // Con 95 obs hasta target, prevCount=90 → frac=(95-90)/10=0.5 → p95 = 0.05+0.025=0.075.
    for (let i = 0; i < 90; i++) {
      metrics.httpRequestDurationSeconds.observe({ method: 'GET', route: '/api/y', status: '200' }, 0.01);
    }
    for (let i = 0; i < 10; i++) {
      metrics.httpRequestDurationSeconds.observe({ method: 'GET', route: '/api/y', status: '200' }, 0.1);
    }
    const s = await dashboardMetrics.snapshot();
    expect(s.latencyP50s).toBeLessThanOrEqual(0.025);
    expect(s.latencyP95s).toBeGreaterThan(0.025);
    expect(s.latencyP95s).toBeLessThanOrEqual(0.1);
  });
});

describe('takeSample / history', () => {
  it('agrega muestras al historial y trunca al máximo', async () => {
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/x', status: '200' }, 1);
    await dashboardMetrics.takeSample();
    const h1 = dashboardMetrics.history();
    expect(h1.length).toBeGreaterThanOrEqual(1);
    const last = h1[h1.length - 1];
    expect(last.httpRequests).toBeGreaterThanOrEqual(1);
    expect(last.ts).toBeGreaterThan(0);
  });
});
