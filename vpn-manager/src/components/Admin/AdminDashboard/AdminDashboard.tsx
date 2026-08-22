import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Users, UserCog, Briefcase, Activity, RefreshCw } from 'lucide-react';
import AsyncQueryState from '../../Common/AsyncQueryState';
import { adminApi } from '../../../services/adminApi';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { isPlatformAdmin } from '../../../utils/permissions';
import type { AdminSummary, AuditLog } from '../../../types/account';
import MetricsPanel from './MetricsPanel';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'hace instantes';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [recent, setRecent] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { session } = useWorkspaceSession();
  const canAdmin = isPlatformAdmin(session);

  const load = useCallback(async () => {
    if (!canAdmin) { setLoading(false); return; }   // solo el Administrador consulta /api/admin
    setLoading(true); setError(null);
    try {
      const r = await adminApi.summary();
      setSummary(r.summary); setRecent(r.recent);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.');
    }
    finally { setLoading(false); }
  }, [canAdmin]);
  useEffect(() => { load(); }, [load]);

  const cards = summary ? [
    { label: 'Moderadores', value: summary.moderadores, icon: UserCog, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-500/20' },
    { label: 'Miembros', value: summary.miembros, icon: Users, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-500/20' },
    { label: 'Workspaces', value: summary.workspaces, icon: Briefcase, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
    { label: 'Acciones (24h)', value: summary.acciones_24h, icon: Activity, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
  ] : [];

  return (
    <div className="space-y-4 sm:space-y-5 reveal-stagger">
      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span>Dashboard</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">Resumen general de la plataforma</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-outline flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50 sm:w-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {error && summary && (
        <div className="card border-amber-200 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:text-amber-300" role="status">
          No se pudo actualizar el resumen: {error}
        </div>
      )}
      <AsyncQueryState
        loading={loading && !summary}
        error={!summary ? error : null}
        onRetry={() => { void load(); }}
        loadingLabel="Cargando resumen..."
        skeletonRows={4}
      >
        <>
          <section aria-labelledby="admin-overview-title" className="space-y-3">
            <div>
              <h3 id="admin-overview-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">Resumen de la plataforma</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Usuarios, espacios y actividad administrativa.</p>
            </div>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card flex min-w-0 items-center gap-3 p-4 sm:flex-col sm:items-start">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-none">{value}</div>
                  <div className="mt-1.5 break-words text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">{label}</div>
                </div>
              </div>
            ))}
          </div>
          </section>

          {/* Q2 — métricas en vivo del backend (Prometheus → JSON) */}
          <section aria-labelledby="admin-health-title" className="space-y-3">
            <div>
              <h3 id="admin-health-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">Salud del sistema</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Rendimiento, accesos y comunicación con RouterOS.</p>
            </div>
            <MetricsPanel />
          </section>

          {/* Actividad reciente (global) */}
          <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/40 sm:px-6">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Actividad reciente (toda la plataforma)</h3>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-500 text-sm">Sin actividad registrada</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((log, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-6">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs leading-5 text-slate-700 dark:text-slate-200">
                        <span className="break-all font-bold">{log.user_email || 'Sistema'}</span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">{log.action}</span>{' '}
                        {log.tunnel_id && <span className="font-mono text-slate-600 dark:text-slate-300">{log.tunnel_id}</span>}
                      </p>
                      <p className="text-2xs text-slate-500 dark:text-slate-500 mt-0.5">{timeAgo(log.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      </AsyncQueryState>
    </div>
  );
}
