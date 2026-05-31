import { Activity, Power, PowerOff, ScanLine, ShieldOff, FileClock } from 'lucide-react';
import type { AuditLog } from '../../../../types/account';

interface AuditTimelineProps {
  logs: AuditLog[];
  live?: boolean;
}

function actionMeta(action: string): { icon: typeof Activity; color: string; label: string } {
  const a = action.toUpperCase();
  if (a.includes('ACTIVATE')) return { icon: Power, color: 'text-emerald-500', label: 'Activó túnel' };
  if (a.includes('DEACTIVATE') || a.includes('REVOKE')) return { icon: PowerOff, color: 'text-rose-500', label: 'Revocó acceso' };
  if (a.includes('SCAN')) return { icon: ScanLine, color: 'text-sky-500', label: 'Escaneó' };
  if (a.includes('DELETE')) return { icon: ShieldOff, color: 'text-rose-500', label: 'Eliminó' };
  return { icon: Activity, color: 'text-indigo-500', label: action };
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'hace instantes';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AuditTimeline({ logs, live }: AuditTimelineProps) {
  return (
    <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center gap-2">
        <FileClock className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Actividad reciente</h3>
        {live && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-2xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo
          </span>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center gap-2">
          <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">Sin actividad registrada aún</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {logs.map(log => {
            const { icon: Icon, color, label } = actionMeta(log.action);
            const actor = log.user_name || log.user_email || 'Sistema';
            return (
              <li key={log.id} className="flex items-start gap-3 px-6 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                <div className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-700 dark:text-slate-200">
                    <span className="font-bold">{actor}</span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">{label.toLowerCase()}</span>{' '}
                    {log.tunnel_id && <span className="font-mono text-slate-600 dark:text-slate-300">{log.tunnel_id}</span>}
                  </p>
                  <p className="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {timeAgo(log.created_at)}
                    {log.ip_address && <span className="font-mono ml-2">· {log.ip_address}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
