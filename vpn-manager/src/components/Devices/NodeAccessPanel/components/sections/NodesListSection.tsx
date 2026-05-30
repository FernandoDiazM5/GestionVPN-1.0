import { Search, X, RefreshCw, Download, ArrowUpDown, SortAsc, SortDesc, Radio, AlertCircle } from 'lucide-react';
import NodeCard from '../../../../VPN/NodeCard';
import type { NodeInfo } from '../../../../../types/api';

interface NodesListSectionProps {
  nodes: NodeInfo[];
  hasLoaded: boolean;
  search: string;
  sortMode: 'default' | 'connected' | 'disconnected';
  filteredNodes: NodeInfo[];
  connectedNodes: NodeInfo[];
  disconnectedNodes: NodeInfo[];
  nodesWithVrf: NodeInfo[];
  nodeTags: Record<string, string[]>;

  onSearchChange: (value: string) => void;
  onSortChange: () => void;
  onExportCsv: () => void;
  onEditNode: (node: NodeInfo) => void;
  onDeleteNode: (node: NodeInfo) => void;
  onScriptNode: (node: NodeInfo) => void;
  onRenameNode: (node: NodeInfo, newName: string) => void;
  onHistoryNode: (node: NodeInfo) => void;
  onTagClick: (node: NodeInfo) => void;
  onRefreshNodes: () => void;

  isLoading: boolean;
}

export default function NodesListSection({
  nodes,
  hasLoaded,
  search,
  sortMode,
  filteredNodes,
  connectedNodes,
  disconnectedNodes,
  nodesWithVrf,
  nodeTags,
  onSearchChange,
  onSortChange,
  onExportCsv,
  onEditNode,
  onDeleteNode,
  onScriptNode,
  onRenameNode,
  onHistoryNode,
  onTagClick,
  onRefreshNodes,
  isLoading,
}: NodesListSectionProps) {
  return (
    <>
      {/* ── Banner caché local (MikroTik offline) ── */}
      {hasLoaded && nodes.length > 0 && nodes.some(n => n.cached) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-amber-700">MikroTik no disponible</span>
            <span className="text-amber-600 ml-1.5">
              Mostrando {nodes.length} nodo{nodes.length !== 1 ? 's' : ''} desde la base de datos local.
              {nodes[0]?.last_seen ? ` Última sincronización: ${new Date(nodes[0].last_seen).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
          <button onClick={onRefreshNodes}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-700 font-bold hover:bg-amber-200 transition-colors shrink-0">
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
        </div>
      )}

      {/* ── Tabla de nodos ── */}
      {hasLoaded && nodes.length > 0 && (
        <div className="card overflow-hidden">

          {/* Barra superior: stats + búsqueda + controles */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            {/* Stats inline */}
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="text-slate-400 font-medium">
                <span className="font-bold text-slate-700">{nodes.length}</span> nodos
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-emerald-600 font-semibold">
                <span className="font-bold">{connectedNodes.length}</span> conectados
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-sky-600 font-semibold">
                <span className="font-bold">{nodesWithVrf.length}</span> con VRF
              </span>
              <span className="text-slate-200">|</span>
              <span className="text-rose-500 font-semibold">
                <span className="font-bold">{disconnectedNodes.length}</span> desconectados
              </span>
            </div>

            {/* Controles: sort + export + búsqueda */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ordenar */}
              <button onClick={onSortChange}
                title={sortMode === 'default' ? 'Orden original' : sortMode === 'connected' ? 'Conectados primero' : 'Desconectados primero'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors
                  ${sortMode !== 'default' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'}`}>
                {sortMode === 'connected' ? <SortAsc className="w-3.5 h-3.5" /> : sortMode === 'disconnected' ? <SortDesc className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
                <span>{sortMode === 'connected' ? 'Conectados' : sortMode === 'disconnected' ? 'Desconectados' : 'Ordenar'}</span>
              </button>
              {/* Exportar CSV */}
              <button onClick={onExportCsv} title="Exportar inventario a CSV"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>

            {/* Búsqueda */}
            <div className="relative w-full sm:w-64">
              {/* Dummy inputs para atrapar el autofill agresivo de Chrome/Edge */}
              <input type="text" name="dummy-user" style={{ display: 'none' }} />
              <input type="password" name="dummy-pass" style={{ display: 'none' }} />

              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                name="node-search-filter-off"
                autoComplete="new-password"
                placeholder="Buscar nodo, VRF, red, usuario…"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-xs rounded-xl border border-slate-200
                           bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                           placeholder:text-slate-400 text-slate-700"
              />
              {search && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Nodo</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">VRF</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Red LAN</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">IP Túnel</th>
                  <th className="px-4 py-4 text-left font-bold text-slate-500 uppercase tracking-wider">Usuario PPP</th>
                  <th className="px-4 py-4 text-right font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node, idx) => (
                  <NodeCard
                    key={node.id} node={node} rowIndex={idx}
                    onEdit={() => onEditNode(node)}
                    onDelete={() => onDeleteNode(node)}
                    onScript={() => onScriptNode(node)}
                    onRename={(newName) => onRenameNode(node, newName)}
                    onHistory={() => onHistoryNode(node)}
                    onTagClick={() => onTagClick(node)}
                    tags={nodeTags[node.ppp_user] || []}
                  />
                ))}
                {filteredNodes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Sin resultados para <span className="font-mono font-bold">"{search}"</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {hasLoaded && nodes.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin nodos SSTP</p>
          <p className="text-slate-400 text-sm">El router no tiene túneles SSTP configurados</p>
        </div>
      )}

      {/* ── Estado inicial ── */}
      {!hasLoaded && !isLoading && (
        <div className="card border-dashed border-2 border-slate-200 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Search className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 font-medium">Sin datos aún</p>
          <p className="text-slate-400 text-sm">Haz clic en "Cargar Nodos" para obtener los túneles VRF del router</p>
        </div>
      )}
    </>
  );
}
