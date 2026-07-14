import { useState, useEffect, useCallback } from 'react';
import { X, History } from 'lucide-react';
import AsyncQueryState from '../../../Common/AsyncQueryState';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';
import Dialog from '../../../Common/Dialog';

export default function HistoryModal({ node, onClose }: { node: NodeInfo; onClose: () => void }) {
  const [history, setHistory] = useState<{ event: string; timestamp: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/node/history/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pppUser: node.ppp_user }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'No se pudo cargar el historial.');
      setHistory(data.history || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  }, [node.ppp_user]);

  useEffect(() => { void load(); }, [load]);

  const fmt = (ts: number) => new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog
      title={`Historial de ${node.nombre_nodo}`}
      onClose={onClose}
      panelClassName="modal-panel modal-panel-md max-h-[80vh]"
    >
        <div className="modal-header-decorated modal-header-sky">
          <div className="flex items-center gap-3">
            <div className="modal-header-icon">
              <History className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Historial — {node.nombre_nodo}</p>
              <p className="text-2xs text-sky-200">{node.ppp_user}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-header-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <AsyncQueryState
            loading={loading}
            error={error}
            empty={history.length === 0}
            onRetry={() => { void load(); }}
            loadingLabel="Cargando historial..."
            emptyTitle="Sin eventos registrados aun"
            skeletonRows={2}
          >
            <div className="space-y-2">
              {history.map((h, i) => {
                const cfg: Record<string, { dot: string; label: string; row: string; text: string }> = {
                  connected: { dot: 'bg-emerald-500', label: 'Conectado VPN', row: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100', text: 'text-emerald-700' },
                  disconnected: { dot: 'bg-rose-500', label: 'Desconectado VPN', row: 'bg-rose-50 dark:bg-rose-500/10 border-rose-100', text: 'text-rose-700' },
                  tunnel_activated: { dot: 'bg-sky-500', label: 'Túnel activado', row: 'bg-sky-50 dark:bg-sky-500/10 border-sky-100', text: 'text-sky-700' },
                  tunnel_deactivated: { dot: 'bg-amber-500', label: 'Túnel desactivado', row: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100', text: 'text-amber-700' },
                };
                const c = cfg[h.event] ?? { dot: 'bg-slate-400', label: h.event, row: 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800', text: 'text-slate-600 dark:text-slate-300' };
                return (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${c.row}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                    <span className={`font-bold ${c.text}`}>{c.label}</span>
                    <span className="text-slate-500 dark:text-slate-400 ml-auto font-mono">{fmt(h.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          </AsyncQueryState>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            Cerrar
          </button>
        </div>
    </Dialog>
  );
}
