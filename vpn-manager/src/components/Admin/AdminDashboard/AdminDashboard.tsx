import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, UserCog, Briefcase, Activity, Loader2, RefreshCw } from 'lucide-react';
import { adminApi } from '../../../services/adminApi';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { isPlatformAdmin } from '../../../utils/permissions';
import type { AdminSummary, AuditLog } from '../../../types/account';

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
  const [error, setError] = useState(false);
  const { session } = useWorkspaceSession();
  const canAdmin = isPlatformAdmin(session);

  const load = async () => {
    if (!canAdmin) { setLoading(false); return; }   // solo el Administrador consulta /api/admin
    setLoading(true); setError(false);
    try {
      const r = await adminApi.summary();
      setSummary(r.summary); setRecent(r.recent);
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [canAdmin]);

  const cards = summary ? [
    { label: 'Moderadores', value: summary.moderadores, icon: UserCog, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-500/20' },
    { label: 'Miembros', value: summary.miembros, icon: Users, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-500/20' },
    { label: 'Workspaces', value: summary.workspaces, icon: Briefcase, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
    { label: 'Acciones (24h)', value: summary.acciones_24h, icon: Activity, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
  ] : [];

  return (
    <div className="space-y-5 reveal-stagger">
      <div className="card p-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span>Dashboard</span>
          </h2>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Resumen general de la plataforma</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-outline px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {loading && !summary ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : error ? (
        <div className="card p-8 text-center text-slate-400 dark:text-slate-500">No se pudo cargar el resumen (¿MySQL activo?).</div>
      ) : (
        <>
          {/* Tarjetas de métricas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card p-4 flex flex-col gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-none">{value}</div>
                  <div className="text-2xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mt-1.5">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Actividad reciente (global) */}
          <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Actividad reciente (toda la plataforma)</h3>
            </div>
            {recent.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">Sin actividad registrada</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((log, i) => (
                  <li key={i} className="flex items-center gap-3 px-6 py-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        <span className="font-bold">{log.user_email || 'Sistema'}</span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">{log.action}</span>{' '}
                        {log.tunnel_id && <span className="font-mono text-slate-600 dark:text-slate-300">{log.tunnel_id}</span>}
                      </p>
                      <p className="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">{timeAgo(log.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
