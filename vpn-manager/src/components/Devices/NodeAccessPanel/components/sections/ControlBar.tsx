import { Pencil, Plus, Download, RefreshCw, Globe } from 'lucide-react';
import { apiFetch } from '../../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../../config';

interface ControlBarProps {
  globalServerIP: string;
  editingGlobalIP: boolean;
  setGlobalServerIP: (ip: string) => void;
  setEditingGlobalIP: (value: boolean) => void;
  onNewNode: () => void;
  onBatchCsv: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  hasLoaded: boolean;
}

export default function ControlBar({
  globalServerIP,
  editingGlobalIP,
  setGlobalServerIP,
  setEditingGlobalIP,
  onNewNode,
  onBatchCsv,
  onRefresh,
  isLoading,
  hasLoaded,
}: ControlBarProps) {
  return (
    <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
          <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>Acceso a Nodos VRF</span>
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Abre acceso a APs y CPEs remotos mediante enrutamiento VRF
        </p>
        {/* IP global del servidor SSTP */}
        <div className="flex items-center gap-1.5 mt-2">
          <Globe className="w-3 h-3 text-slate-400" />
          <span className="text-[11px] text-slate-400 font-medium">Servidor SSTP:</span>
          {editingGlobalIP ? (
            <input
              value={globalServerIP}
              onChange={e => setGlobalServerIP(e.target.value)}
              onBlur={() => {
                const ip = globalServerIP.trim();
                localStorage.setItem('server_public_ip', ip);
                apiFetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: ip }) }).catch(() => { });
                setEditingGlobalIP(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const ip = globalServerIP.trim();
                  localStorage.setItem('server_public_ip', ip);
                  apiFetch(`${API_BASE_URL}/api/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'server_public_ip', value: ip }) }).catch(() => { });
                  setEditingGlobalIP(false);
                }
                if (e.key === 'Escape') { setGlobalServerIP(localStorage.getItem('server_public_ip') || ''); setEditingGlobalIP(false); }
              }}
              placeholder="Ej: 213.173.36.232"
              className="px-2 py-0.5 text-[11px] font-mono border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 w-36"
              autoFocus
            />
          ) : (
            <button onClick={() => setEditingGlobalIP(true)} className="flex items-center gap-1 group">
              <span className={`text-[11px] font-mono font-semibold ${globalServerIP ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                {globalServerIP || 'Sin configurar'}
              </span>
              <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onNewNode}
          className="px-4 py-2.5 flex items-center space-x-2 rounded-xl text-sm font-bold
                     bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Nodo</span>
        </button>
        <button
          onClick={onBatchCsv}
          title="Provisionar múltiples nodos desde CSV"
          className="px-4 py-2.5 flex items-center space-x-2 rounded-xl text-sm font-bold
                     bg-violet-500 hover:bg-violet-600 text-white shadow-md shadow-violet-500/25 transition-all active:scale-[0.98]"
        >
          <Download className="w-4 h-4" />
          <span>CSV</span>
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="btn-primary px-6 py-3 flex items-center space-x-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Cargando...' : hasLoaded ? 'Actualizar Nodos' : 'Cargar Nodos'}</span>
        </button>
      </div>
    </div>
  );
}
