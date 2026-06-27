import { useState } from 'react';
import { Activity, Power, PowerOff, ScanLine, ShieldOff, FileClock, Download, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AuditLog } from '../../../../types/account';
import { auditApi, downloadBlob } from '../../../../services/auditApi';

interface AuditTimelineProps {
  logs: AuditLog[];
  live?: boolean;
}

type ExportRange = '7d' | '30d' | '90d' | 'all';
const RANGE_MS: Record<ExportRange, number | null> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  'all': null,
};
const RANGE_LABEL: Record<ExportRange, string> = {
  '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', '90d': 'Últimos 90 días', 'all': 'Todo el historial',
};

const PER_PAGE = 8; // entradas por página — mantiene el panel compacto

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
  const [showExport, setShowExport] = useState(false);
  const [range, setRange] = useState<ExportRange>('30d');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Paginación cliente. `safePage` clampa por si la lista encogió (purga/retención)
  // o creció (evento en vivo) mientras estábamos en una página alta.
  const total = logs.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageLogs = logs.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  async function doExport(format: 'csv' | 'json') {
    setBusy(true); setErr(null);
    try {
      const now = Date.now();
      const window = RANGE_MS[range];
      const result = await auditApi.exportLogs({
        from: window != null ? now - window : 0,
        to: now,
        format,
      });
      downloadBlob(result);
      setShowExport(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error exportando');
    } finally { setBusy(false); }
  }

  return (
    <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center gap-2 relative">
        <FileClock className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Actividad reciente</h3>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-2xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo
          </span>
        )}
        <button
          onClick={() => { setShowExport(v => !v); setErr(null); }}
          className="ml-auto btn-outline text-xs"
          title="Exportar bitácora"
        >
          <Download className="w-3.5 h-3.5" /> Exportar
        </button>

        {showExport && (
          <div
            role="dialog"
            aria-label="Exportar bitácora"
            className="absolute top-full right-6 mt-2 z-20 w-72 card p-4 shadow-xl border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Exportar bitácora</p>
            <div>
              <label className="block text-2xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Rango</label>
              <select
                value={range}
                onChange={e => setRange(e.target.value as ExportRange)}
                disabled={busy}
                className="input-field text-xs w-full"
              >
                {(['7d', '30d', '90d', 'all'] as ExportRange[]).map(r => (
                  <option key={r} value={r}>{RANGE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            {err && (
              <p className="text-xs text-rose-600 flex items-start gap-1"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {err}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => doExport('csv')} disabled={busy} className="btn-primary text-xs flex-1">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                CSV
              </button>
              <button onClick={() => doExport('json')} disabled={busy} className="btn-outline text-xs flex-1">
                JSON
              </button>
            </div>
            <p className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
              El CSV abre directo en Excel (BOM UTF-8). Máx 10 000 filas por export.
            </p>
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center gap-2">
          <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-400 dark:text-slate-500 text-sm">Sin actividad registrada aún</p>
        </div>
      ) : (
        <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {pageLogs.map(log => {
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

        {total > PER_PAGE && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
            <span className="text-2xs text-slate-400 dark:text-slate-500">
              {safePage * PER_PAGE + 1}–{Math.min((safePage + 1) * PER_PAGE, total)} de {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                aria-label="Página anterior" title="Anterior"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:hover:text-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums px-1">
                {safePage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                aria-label="Página siguiente" title="Siguiente"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:hover:text-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
