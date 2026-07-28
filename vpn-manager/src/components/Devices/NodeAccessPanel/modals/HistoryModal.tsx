import { useState, useEffect, useCallback } from 'react';
import { History } from 'lucide-react';
import AsyncQueryState from '../../../Common/AsyncQueryState';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';
import Dialog from '../../../Common/Dialog';
import SiteModalHeader from '../../../Common/SiteModalHeader';

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
      title={`Actividad del sitio ${node.nombre_nodo}`}
      onClose={onClose}
      panelClassName="modal-panel modal-panel-md max-h-[80vh]"
    >
        <SiteModalHeader
          icon={History}
          title="Actividad del sitio"
          siteName={node.nombre_nodo}
          description="Conexiones recientes"
          onClose={onClose}
        />
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
                  connected: { dot: 'bg-emerald-500', label: 'Conexión iniciada', row: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100', text: 'text-emerald-700' },
                  disconnected: { dot: 'bg-slate-400', label: 'Conexión finalizada', row: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300' },
                  tunnel_activated: { dot: 'bg-emerald-500', label: 'Conexión iniciada', row: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100', text: 'text-emerald-700' },
                  tunnel_deactivated: { dot: 'bg-slate-400', label: 'Conexión finalizada', row: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300' },
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
          <button onClick={onClose} className="btn-outline btn-md w-full">
            Cerrar
          </button>
        </div>
    </Dialog>
  );
}
