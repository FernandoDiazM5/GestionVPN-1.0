import { useState, useMemo } from 'react';
import { AlertCircle, Radio, Search, RefreshCw } from 'lucide-react';
import NodesFilterBar from './NodesFilterBar';
import NodesTable from './NodesTable';
import type { SortKey, SortDir } from './NodesTable';
import type { NodeInfo } from '../../../../../types/api';

interface NodesListSectionProps {
  nodes: NodeInfo[];
  hasLoaded: boolean;
  nodeTags: Record<string, string[]>;
  onExportCsv: () => void;
  onEditNode: (node: NodeInfo) => void;
  onDeleteNode: (node: NodeInfo) => void;
  onScriptNode: (node: NodeInfo) => void;
  onRenameNode: (node: NodeInfo, newName: string) => void;
  onHistoryNode: (node: NodeInfo) => void;
  onTagClick: (node: NodeInfo) => void;
  onDiagnoseNode: (node: NodeInfo) => void;
  onRefreshNodes: () => void;
  isLoading: boolean;
}

export default function NodesListSection({
  nodes,
  hasLoaded,
  nodeTags,
  onExportCsv,
  onEditNode,
  onDeleteNode,
  onScriptNode,
  onRenameNode,
  onHistoryNode,
  onTagClick,
  onDiagnoseNode,
  onRefreshNodes,
  isLoading,
}: NodesListSectionProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Paginación básica
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey('default'); setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredAndSortedNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = nodes;
    
    // 1. Filter
    if (q) {
      result = result.filter(n =>
        n.nombre_nodo?.toLowerCase().includes(q) ||
        n.nombre_vrf?.toLowerCase().includes(q) ||
        n.segmento_lan?.toLowerCase().includes(q) ||
        n.ppp_user?.toLowerCase().includes(q)
      );
    }
    
    // 2. Sort
    if (sortKey !== 'default') {
      result = [...result].sort((a, b) => {
        let valA: any = a[sortKey as keyof NodeInfo];
        let valB: any = b[sortKey as keyof NodeInfo];
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (sortKey === 'running') {
          valA = a.running ? 1 : 0;
          valB = b.running ? 1 : 0;
        }

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [nodes, search, sortKey, sortDir]);

  // Reset pagination on search change
  useMemo(() => { setCurrentPage(1); }, [search, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredAndSortedNodes.length / itemsPerPage);
  const paginatedNodes = filteredAndSortedNodes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      {/* ── Banner caché local (MikroTik offline) ── */}
      {hasLoaded && nodes.length > 0 && nodes.some(n => n.cached) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs dark:bg-amber-500/10 dark:border-amber-500/30">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-amber-700 dark:text-amber-400">MikroTik no disponible</span>
            <span className="text-amber-600 dark:text-amber-500 ml-1.5">
              Mostrando {nodes.length} nodo{nodes.length !== 1 ? 's' : ''} desde la base de datos local.
            </span>
          </div>
          <button onClick={onRefreshNodes}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-700 font-bold hover:bg-amber-200 transition-colors shrink-0">
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
        </div>
      )}



      {/* ── Sección de Tabla y Filtros ── */}
      {hasLoaded && nodes.length > 0 && (
        <div className="card overflow-hidden border border-slate-200">
          
          <NodesFilterBar
            search={search}
            onSearchChange={setSearch}
            onExportCsv={onExportCsv}
            resultCount={filteredAndSortedNodes.length}
            totalCount={nodes.length}
          />

          <NodesTable 
            nodes={paginatedNodes}
            nodeTags={nodeTags}
            searchQuery={search}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onEditNode={onEditNode}
            onDeleteNode={onDeleteNode}
            onScriptNode={onScriptNode}
            onDiagnoseNode={onDiagnoseNode}
            onRenameNode={onRenameNode}
            onHistoryNode={onHistoryNode}
            onTagClick={onTagClick}
          />

          {/* ── Paginación ── */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
              <span>Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredAndSortedNodes.length)} de {filteredAndSortedNodes.length} nodos</span>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                >
                  Anterior
                </button>
                <div className="px-3 font-semibold text-slate-700 dark:text-slate-200">{currentPage} / {totalPages}</div>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state: Sin nodos ── */}
      {hasLoaded && nodes.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 dark:border-slate-700 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/15 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 dark:text-slate-300 font-medium">Sin nodos SSTP</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm">El router no tiene túneles SSTP configurados</p>
        </div>
      )}

      {/* ── Estado inicial ── */}
      {!hasLoaded && !isLoading && (
        <div className="card border-dashed border-2 border-slate-200 dark:border-slate-700 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/15 rounded-2xl flex items-center justify-center">
            <Search className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 dark:text-slate-300 font-medium">Sin datos aún</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm">Haz clic en "Actualizar" para obtener los túneles VRF del router</p>
        </div>
      )}
    </>
  );
}
