import { Pencil, Plus, RefreshCw, Globe, Waypoints } from 'lucide-react';
import { apiFetch } from '../../../../../utils/apiClient';
import { API_BASE_URL } from '../../../../../config';
import { Button, PageHeader } from '../../../../Common/ui';

interface ControlBarProps {
  globalServerIP: string;
  editingGlobalIP: boolean;
  setGlobalServerIP: (ip: string) => void;
  setEditingGlobalIP: (value: boolean) => void;
  onNewNode: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  hasLoaded: boolean;
  lastUpdatedAt?: number | null;
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
  lastUpdatedAt = null,
  showServerIP = false,
  canCreateNode = true,
}: ControlBarProps) {
  return (
    <PageHeader
      title="Sitios remotos"
      description="Conecta de forma segura con las antenas y equipos de cada sitio"
      icon={Waypoints}
      titleId="remote-sites-title"
      aside={<div className="flex flex-wrap items-center gap-2">
        {canCreateNode && <Button onClick={onNewNode} variant="primary" size="md" leadingIcon={Plus}>Agregar sitio</Button>}
        <Button onClick={onRefresh} disabled={isLoading} loading={isLoading} loadingLabel="Actualizando..." variant="outline" size="md" leadingIcon={RefreshCw}>{hasLoaded ? 'Actualizar' : 'Cargar sitios'}</Button>
      </div>}
    >
      {(lastUpdatedAt || showServerIP) ? <div className="border-t border-slate-200 px-6 py-3 dark:border-slate-800">
        {lastUpdatedAt && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            Última actualización: {new Date(lastUpdatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {/* IP global del servidor SSTP — solo visible para Administrador de plataforma */}
        {showServerIP && (
        <div className="flex items-center gap-1.5 mt-2">
          <Globe className="w-3 h-3 text-slate-500 dark:text-slate-400" />
          <span className="text-2xs text-slate-500 dark:text-slate-400 font-medium">Servidor SSTP:</span>
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
              <span className={`text-2xs font-mono font-semibold ${globalServerIP ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400 italic'}`}>
                {globalServerIP || 'Sin configurar'}
              </span>
              <Pencil className="w-2.5 h-2.5 text-slate-500 dark:text-slate-500 group-hover:text-indigo-500 transition-colors" />
            </button>
          )}
        </div>
        )}
      </div> : null}
    </PageHeader>
  );
}
