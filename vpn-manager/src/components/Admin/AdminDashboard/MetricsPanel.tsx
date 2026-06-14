// ============================================================
//  MetricsPanel — visualiza métricas Prometheus del backend (Q2)
//
//  Polling cada 10s (el sampler del backend toma 1/min, pero al recargar
//  la página queremos refrescar el snapshot actual rápidamente).
//
//  Cards principales:
//   • Requests/min      — derivada (delta entre snapshots) si hay 2+
//   • Latencia p95      — segundos → ms
//   • Auth fails (h)    — auth_fails_total en última hora (derivada)
//   • RouterOS error %  — (routerosErrors / routerosWrites) * 100
//
//  Sparklines: 2 abajo (HTTP requests acumulado, RouterOS error rate)
//  + tarjeta uptime + breakdown de errores routeros por tipo.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Activity, Gauge, Mail, Shield, Wifi, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { dashboardApi } from '../../../services/dashboardApi';
import type { DashboardMetricsResponse, DashboardSample } from '@gestionvpn/contracts';
import Sparkline from '../../Common/Sparkline';

const POLL_MS = 10_000;

function formatMs(seconds: number): string {
  const ms = seconds * 1000;
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function deriveRate(history: DashboardSample[], key: keyof DashboardSample, perMs: number): number {
  if (history.length < 2) return 0;
  const oldest = history[0];
  const newest = history[history.length - 1];
  const elapsedMs = newest.ts - oldest.ts;
  if (elapsedMs <= 0) return 0;
  const delta = (newest[key] as number) - (oldest[key] as number);
  return (delta / elapsedMs) * perMs;
}

export default function MetricsPanel() {
  const [data, setData] = useState<DashboardMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  async function refresh() {
    try {
      const r = await dashboardApi.metrics();
      setData(r);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    pollRef.current = window.setInterval(refresh, POLL_MS);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  if (loading && !data) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="card p-6 text-sm text-rose-600 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5" /> No se pudo cargar las métricas: {err}
      </div>
    );
  }

  if (!data) return null;

  const { current, history } = data;
  const reqsPerMin = deriveRate(history, 'httpRequests', 60_000);
  const authFailsPerHour = deriveRate(history, 'authFails', 60 * 60_000);
  const rosErrorPct = current.routerosWrites > 0
    ? Math.round((1 - current.routerosOkRatio) * 100)
    : 0;

  const httpReqsSeries = history.map(s => s.httpRequests);
  const latencySeries = history.map(s => s.latencyP95s * 1000); // ms
  const errorRateSeries = history.map((s, i) => {
    if (i === 0) return 0;
    const dErr = s.routerosErrors - history[i - 1].routerosErrors;
    const dWri = s.routerosWrites - history[i - 1].routerosWrites;
    return dWri > 0 ? Math.round((dErr / dWri) * 100) : 0;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo · cada {POLL_MS / 1000}s
        </span>
        <button
          onClick={() => { setLoading(true); void refresh(); }}
          className="ml-auto btn-outline text-2xs"
          title="Refrescar ahora"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <span className="text-slate-500 dark:text-slate-400">Uptime: <span className="font-mono">{formatUptime(current.uptimeMs)}</span></span>
      </div>

      {/* 4 cards de KPI principales con sparkline embebida */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Activity}
          label="Requests / min"
          value={reqsPerMin >= 1 ? Math.round(reqsPerMin).toString() : reqsPerMin.toFixed(2)}
          sub={`${current.httpRequests} totales`}
          sparkline={httpReqsSeries}
          color="text-indigo-500"
        />
        <KpiCard
          icon={Gauge}
          label="Latencia p95"
          value={formatMs(current.latencyP95s)}
          sub={`p50 ${formatMs(current.latencyP50s)} · p99 ${formatMs(current.latencyP99s)}`}
          sparkline={latencySeries}
          color="text-amber-500"
        />
        <KpiCard
          icon={Shield}
          label="Auth fails / h"
          value={authFailsPerHour >= 1 ? Math.round(authFailsPerHour).toString() : '0'}
          sub={`${current.authFails} totales`}
          sparkline={history.map(s => s.authFails)}
          color={current.authFails > 0 ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}
        />
        <KpiCard
          icon={Wifi}
          label="RouterOS error %"
          value={`${rosErrorPct}%`}
          sub={`${current.routerosErrors} / ${current.routerosWrites} writes`}
          sparkline={errorRateSeries}
          color={rosErrorPct > 5 ? 'text-rose-500' : 'text-emerald-500'}
        />
      </div>

      {/* Breakdown de errores RouterOS por tipo (si hay) */}
      {Object.keys(current.routerosErrorsByType).length > 0 && (
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-rose-500" /> RouterOS errores por tipo
          </h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(current.routerosErrorsByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, n]) => (
                <span key={type} className="badge badge-danger">
                  {type} · <span className="font-mono ml-1">{n}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Breakdown auth fails por motivo (si hay) */}
      {Object.keys(current.authFailsByReason).length > 0 && (
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-amber-500" /> Auth fails por motivo
          </h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(current.authFailsByReason)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, n]) => (
                <span key={reason} className="badge badge-warning">
                  {reason} · <span className="font-mono ml-1">{n}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Mail */}
      {current.mailSent > 0 && (
        <div className="card p-4">
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-indigo-500" /> Correos enviados
          </h4>
          <div className="flex flex-wrap gap-2">
            <span className="badge badge-info">total · <span className="font-mono ml-1">{current.mailSent}</span></span>
            {Object.entries(current.mailByKind).map(([kind, n]) => (
              <span key={kind} className="badge badge-neutral">
                {kind} · <span className="font-mono ml-1">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface KpiCardProps {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
  sparkline: number[];
  color: string;
}

function KpiCard({ icon: Icon, label, value, sub, sparkline, color }: KpiCardProps) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className={color}>
          <Sparkline data={sparkline} width={80} height={28} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-none font-mono">{value}</div>
        <div className="text-2xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mt-1.5">{label}</div>
        <div className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
