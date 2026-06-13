import { Pencil, Plus, RefreshCw, Globe, Waypoints } from 'lucide-react';
import { apiFetch } from '../../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../../config';

interface ControlBarProps {
  globalServerIP: string;
  editingGlobalIP: boolean;
  setGlobalServerIP: (ip: string) => void;
  setEditingGlobalIP: (value: boolean) => void;
  onNewNode: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  hasLoaded: boolean;
  /** Mostrar la IP del servidor SSTP (solo Administrador de plataforma). */
  showServerIP?: boolean;
  /** Permitir crear nodos. Falso para MEMBER (solo visualiza). */
  canCreateNode?: boolean;
}

export default function ControlBar({
  globalServerIP,
  editingGlobalIP,
  setGlobalServerIP,
  setEditingGlobalIP,
  onNewNode,
  onRefresh,
  isLoading,
  hasLoaded,
  showServerIP = false,
  canCreateNode = true,
}: ControlBarProps) {
  return (
    <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
          <Waypoints className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <span>Acceso a Nodos VRF</span>
        </h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
          Abre acceso a APs y CPEs remotos mediante enrutamiento VRF
        </p>
        {/* IP global del servidor SSTP — solo visible para Administrador de plataforma */}
        {showServerIP && (
        <div className="flex items-center gap-1.5 mt-2">
          <Globe className="w-3 h-3 text-slate-400" />
          <span className="text-2xs text-slate-400 font-medium">Servidor SSTP:</span>
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
              className="px-2 py-0.5 text-2xs font-mono border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 w-36 dark:bg-slate-800 dark:border-indigo-500/50 dark:text-slate-100"
              autoFocus
            />
          ) : (
            <button onClick={() => setEditingGlobalIP(true)} className="flex items-center gap-1 group">
              <span className={`text-2xs font-mono font-semibold ${globalServerIP ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 italic'}`}>
                {globalServerIP || 'Sin configurar'}
              </span>
              <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </button>
          )}
        </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Acción principal del panel → único botón sólido */}
        {canCreateNode && (
          <button
            onClick={onNewNode}
            className="btn-success px-4 py-2.5 flex items-center space-x-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Nodo</span>
          </button>
        )}
        {/* Secundarios → outline */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="btn-outline px-5 py-2.5 flex items-center space-x-2 text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Cargando...' : hasLoaded ? 'Actualizar Nodos' : 'Cargar Nodos'}</span>
        </button>
      </div>
    </div>
  );
}
