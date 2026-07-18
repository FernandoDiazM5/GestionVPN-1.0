import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock3, Eye, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import type { AirOsAiHistoryDetail, AirOsAiHistoryItem } from '@gestionvpn/contracts';
import type { ApiError } from '../../../../services/sessionClient';
import { airOsAiApi } from '../../../../services/airOsAiApi';
import AsyncQueryState from '../../../Common/AsyncQueryState';
import Dialog from '../../../Common/Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  type?: 'DEVICE' | 'NETWORK';
}

export function AirOsAiHistoryDialog({ open, onClose, type }: Props) {
  const [items, setItems] = useState<AirOsAiHistoryItem[]>([]);
  const [detail, setDetail] = useState<AirOsAiHistoryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await airOsAiApi.listAnalyses(type);
      setItems(response.analyses);
    } catch (cause) {
      setError((cause as ApiError).message || 'No se pudo cargar el historial');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (open) load();
    else setDetail(null);
  }, [open, load]);

  if (!open) return null;

  const openDetail = async (item: AirOsAiHistoryItem) => {
    setBusyId(item.uuid);
    setError(null);
    try {
      const response = await airOsAiApi.getAnalysis(item.uuid);
      setDetail(response.analysis);
    } catch (cause) {
      setError((cause as ApiError).message || 'No se pudo abrir el análisis');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: AirOsAiHistoryItem) => {
    if (!window.confirm('¿Eliminar este análisis y su snapshot asociado? Esta acción no modifica ningún equipo.')) return;
    setBusyId(item.uuid);
    setError(null);
    try {
      await airOsAiApi.deleteAnalysis(item.uuid);
      setItems(current => current.filter(entry => entry.uuid !== item.uuid));
      if (detail?.uuid === item.uuid) setDetail(null);
    } catch (cause) {
      setError((cause as ApiError).message || 'No se pudo eliminar el análisis');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog title={type === 'NETWORK' ? 'Historial de análisis de red AirOS' : 'Historial de análisis AirOS'} onClose={onClose} panelClassName="modal-panel modal-panel-3xl h-[min(90vh,780px)] max-h-[90vh]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-3">
          {detail && <button onClick={() => setDetail(null)} aria-label="Volver al historial" className="btn-ghost btn-icon min-h-11 min-w-11"><ArrowLeft className="h-4 w-4" /></button>}
          <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-300" />
          <div><p className="font-bold text-slate-800 dark:text-slate-100">{detail ? 'Detalle guardado' : type === 'NETWORK' ? 'Historial de la red visible' : 'Historial Gemini AirOS'}</p><p className="text-xs text-slate-500">Resultados consultivos · retención máxima de 7 días</p></div>
        </div>
        <button onClick={onClose} aria-label="Cerrar historial" className="btn-ghost btn-icon min-h-11 min-w-11"><X className="h-4 w-4" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable]">
        {error && detail && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2"><span className="badge">{detail.type === 'NETWORK' ? 'Red visible' : 'Equipo'}</span><span className="badge">{detail.analysis?.severity || detail.status}</span><span className="badge">{detail.usage.totalTokens} tokens</span></div>
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{detail.analysis?.summary || 'Este análisis no produjo un resultado legible.'}</p>
            {detail.analysis?.findings.map((finding, index) => (
              <article key={`${finding.title}-${index}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">{finding.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{finding.interpretation}</p>
                {finding.evidence.length > 0 && <p className="mt-2 text-xs text-slate-500"><strong>Evidencia:</strong> {finding.evidence.join(' · ')}</p>}
              </article>
            ))}
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Historial informativo: no representa una decisión ni una acción ejecutada.</p>
          </div>
        ) : (
          <AsyncQueryState loading={loading} error={error} empty={!loading && !error && items.length === 0} onRetry={load} loadingLabel="Cargando historial…" emptyTitle="Sin análisis guardados" emptyMessage={type === 'NETWORK' ? 'Los análisis de la red visible aparecerán aquí.' : 'Los análisis individuales y de red aparecerán aquí.'}>
            <div className="space-y-2">
              {items.map(item => (
                <article key={item.uuid} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-700">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="badge">{item.type === 'NETWORK' ? 'Red visible' : 'Equipo'}</span><span className="badge">{item.analysis?.severity || item.status}</span></div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{item.analysis?.summary || 'Análisis sin resultado'}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{new Date(item.createdAt).toLocaleString('es-PE')} · {item.totalTokens} tokens</p>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button onClick={() => openDetail(item)} disabled={busyId !== null || !item.analysis} aria-label="Ver análisis guardado" className="btn-outline btn-icon min-h-11 min-w-11">{busyId === item.uuid ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Eye className="h-4 w-4" />}</button>
                    <button onClick={() => remove(item)} disabled={busyId !== null} aria-label="Eliminar análisis guardado" className="btn-danger btn-icon min-h-11 min-w-11"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </article>
              ))}
            </div>
          </AsyncQueryState>
        )}
      </div>
    </Dialog>
  );
}
