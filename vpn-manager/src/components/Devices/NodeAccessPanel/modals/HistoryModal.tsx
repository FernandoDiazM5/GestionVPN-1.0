import { useState, useEffect } from 'react';
import { X, History, Loader2 } from 'lucide-react';
import { apiFetch } from '../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../config';
import type { NodeInfo } from '../../../../types/api';

export default function HistoryModal({ node, onClose }: { node: NodeInfo; onClose: () => void }) {
  const [history, setHistory] = useState<{ event: string; timestamp: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/node/history/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pppUser: node.ppp_user }),
    }).then(r => r.json()).then(d => { if (d.success) setHistory(d.history || []); })
      .catch(() => { }).finally(() => setLoading(false));
  }, [node.ppp_user]);

  const fmt = (ts: number) => new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel modal-panel-md max-h-[80vh]">
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
          {loading && <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>}
          {!loading && history.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-10">Sin eventos registrados aún.</p>
          )}
          {!loading && history.length > 0 && (
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
                    <span className="text-slate-400 ml-auto font-mono">{fmt(h.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={onClose} className="w-full py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
