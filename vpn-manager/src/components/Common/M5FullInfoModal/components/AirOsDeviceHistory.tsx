import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Eye, Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { AirOsAiHistoryDetail, AirOsAiHistoryItem } from '@gestionvpn/contracts';
import type { ScannedDevice, SavedDevice } from '../../../../types/devices';
import type { ApiError } from '../../../../services/sessionClient';
import { airOsAiApi } from '../../../../services/airOsAiApi';
import AsyncQueryState from '../../AsyncQueryState';

interface Props {
  device: ScannedDevice | SavedDevice;
}

export default function AirOsDeviceHistory({ device }: Props) {
  const [items, setItems] = useState<AirOsAiHistoryItem[]>([]);
  const [detail, setDetail] = useState<AirOsAiHistoryDetail | null>(null);
  const [retentionDays, setRetentionDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await airOsAiApi.listDeviceAnalyses(device);
      setItems(response.analyses);
      setRetentionDays(response.retentionDays);
    } catch (cause) {
      setError((cause as ApiError).message || 'No se pudo cargar el historial de esta antena');
    } finally {
      setLoading(false);
    }
  }, [device]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (item: AirOsAiHistoryItem) => {
    setBusyId(item.uuid);
    setError(null);
    try {
      const response = await airOsAiApi.getAnalysis(item.uuid);
      setDetail(response.analysis);
    } catch (cause) {
      setError((cause as ApiError).message || 'No se pudo abrir el diagnóstico');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: AirOsAiHistoryItem) => {
    if (!window.confirm('¿Eliminar este diagnóstico guardado? Esta acción no modifica la antena.')) return;
    setBusyId(item.uuid);
    setError(null);
    try {
      await airOsAiApi.deleteAnalysis(item.uuid);
      setItems(current => current.filter(entry => entry.uuid !== item.uuid));
      if (detail?.uuid === item.uuid) setDetail(null);
    } catch (cause) {
      setError((cause as ApiError).message || 'No se pudo eliminar el diagnóstico');
    } finally {
      setBusyId(null);
    }
  };

  if (detail) {
    return (
      <div className="space-y-4">
        <button onClick={() => setDetail(null)} className="btn-ghost btn-sm flex min-h-11 items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> Volver al historial
        </button>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <span className="badge">{detail.analysis?.severity || detail.status}</span>
          <span className="badge">Confianza {detail.analysis?.confidence || '—'}</span>
          <span className="badge">{detail.usage.totalTokens} tokens</span>
        </div>
        <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{detail.analysis?.summary || 'Este diagnóstico no produjo un resultado legible.'}</p>
        <div className="space-y-3">
          {detail.analysis?.findings.map((finding, index) => (
            <article key={`${finding.title}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{finding.title}</h3>
              <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{finding.interpretation}</p>
              {finding.evidence.length > 0 && <p className="mt-2 text-xs text-slate-500"><strong>Evidencia:</strong> {finding.evidence.join(' · ')}</p>}
              {finding.manualChecks.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {finding.manualChecks.map(check => <li key={check} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{check}</li>)}
                </ul>
              )}
            </article>
          ))}
        </div>
        {detail.analysis?.limitations.length ? <p className="text-xs leading-5 text-slate-500"><strong>Limitaciones:</strong> {detail.analysis.limitations.join(' · ')}</p> : null}
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Resultado consultivo: la IA no realizó cambios y cualquier decisión sigue bajo tu control.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300" />
        <div>
          <p className="text-sm font-bold text-violet-950 dark:text-violet-100">Diagnósticos de esta antena</p>
          <p className="mt-1 text-xs leading-5 text-violet-800 dark:text-violet-200">Se conservan durante {retentionDays} días y luego se eliminan automáticamente porque las métricas cambian constantemente.</p>
        </div>
      </div>
      <AsyncQueryState
        loading={loading}
        error={error}
        empty={!loading && !error && items.length === 0}
        onRetry={load}
        loadingLabel="Cargando diagnósticos…"
        emptyTitle="Sin diagnósticos guardados"
        emptyMessage="Cuando analices esta antena con Gemini, el resultado aparecerá aquí durante una semana."
      >
        <div className="space-y-2">
          {items.map(item => (
            <article key={item.uuid} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-800/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="badge">{item.analysis?.severity || item.status}</span><span className="badge">{item.totalTokens} tokens</span></div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{item.analysis?.summary || 'Diagnóstico sin resultado'}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{new Date(item.createdAt).toLocaleString('es-PE')}</p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button onClick={() => void openDetail(item)} disabled={busyId !== null || !item.analysis} aria-label="Ver diagnóstico guardado" className="btn-outline btn-icon min-h-11 min-w-11">{busyId === item.uuid ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Eye className="h-4 w-4" />}</button>
                <button onClick={() => void remove(item)} disabled={busyId !== null} aria-label="Eliminar diagnóstico guardado" className="btn-danger btn-icon min-h-11 min-w-11"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
        </div>
      </AsyncQueryState>
    </div>
  );
}
