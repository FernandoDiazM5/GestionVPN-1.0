// ============================================================
//  NodesListSection — orquestador de filtros + tabla + paginación + export
//
//  §44: pasa de `useState` locales (search/sort) a `useNodesPreferences`
//  consolidado, agrega filtros (protocolo + estado), chips + contador
//  permanente, ColumnPicker para columnas opcionales, y reemplaza el
//  botón Exportar simple por NodesExportMenu con 4 formatos.
//
//  useDeferredValue separa typing de la búsqueda del recálculo del filter
//  (typing fluido aunque haya cientos de nodos).
// ============================================================

import { useMemo, useDeferredValue, useEffect, useState } from 'react';
import { AlertCircle, Radio, Search, RefreshCw } from 'lucide-react';
import NodesFilterBar from './NodesFilterBar';
import NodesTable from './NodesTable';
import { NodesExportMenu } from './NodesExportMenu';
import { useNodesPreferences } from '../../hooks/useNodesPreferences';
import type { NodeInfo } from '../../../../../types/api';

interface NodesListSectionProps {
  nodes: NodeInfo[];
  hasLoaded: boolean;
  nodeTags: Record<string, string[]>;
  onEditNode: (node: NodeInfo) => void;
  onDeleteNode: (node: NodeInfo) => void;
  onScriptNode: (node: NodeInfo) => void;
  onRenameNode: (node: NodeInfo, newName: string) => void;
  onHistoryNode: (node: NodeInfo) => void;
  onTagClick: (node: NodeInfo) => void;
  onDiagnoseNode: (node: NodeInfo) => void;
  onRefreshNodes: () => void;
  isLoading: boolean;
  /** Permite mostrar Exportar + kebab de acciones de fila. Falso para MEMBER. */
  canManage?: boolean;
}

const ITEMS_PER_PAGE = 50;

export default function NodesListSection({
  nodes,
  hasLoaded,
  nodeTags,
  onEditNode,
  onDeleteNode,
  onScriptNode,
  onRenameNode,
  onHistoryNode,
  onTagClick,
  onDiagnoseNode,
  onRefreshNodes,
  isLoading,
  canManage = true,
}: NodesListSectionProps) {
  const prefs = useNodesPreferences();
  const [currentPage, setCurrentPage] = useState(1);

  // useDeferredValue → typing fluido en la búsqueda. El filtrado puede
  // correr en una transición de baja prioridad.
  const deferredSearch = useDeferredValue(prefs.searchQuery);

  const filteredNodes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return nodes.filter(n => {
      // Texto libre
      if (q) {
        const matchesText =
          n.nombre_nodo?.toLowerCase().includes(q) ||
          n.nombre_vrf?.toLowerCase().includes(q) ||
          n.segmento_lan?.toLowerCase().includes(q) ||
          n.ppp_user?.toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      // Protocolo
      if (prefs.filterProtocol && n.service !== prefs.filterProtocol) return false;
      // Estado
      if (prefs.filterStatus === 'connected' && !n.running) return false;
      if (prefs.filterStatus === 'disconnected' && n.running) return false;
      return true;
    });
  }, [nodes, deferredSearch, prefs.filterProtocol, prefs.filterStatus]);

  const sortedNodes = useMemo(() => {
    if (prefs.sortKey === 'default') return filteredNodes;
    return [...filteredNodes].sort((a, b) => {
      // running es bool — se compara como número
      if (prefs.sortKey === 'running') {
        const va = a.running ? 1 : 0;
        const vb = b.running ? 1 : 0;
        return prefs.sortDir === 'asc' ? va - vb : vb - va;
      }
      const rawA = a[prefs.sortKey as keyof NodeInfo];
      const rawB = b[prefs.sortKey as keyof NodeInfo];
      const va = typeof rawA === 'string' ? rawA.toLowerCase() : rawA;
      const vb = typeof rawB === 'string' ? rawB.toLowerCase() : rawB;
      // null/undefined al final
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return prefs.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return prefs.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredNodes, prefs.sortKey, prefs.sortDir]);

  // Reset pagination cuando cambia el contenido filtrado.
  useEffect(() => { setCurrentPage(1); }, [deferredSearch, prefs.filterProtocol, prefs.filterStatus, prefs.sortKey, prefs.sortDir]);

  const totalPages = Math.ceil(sortedNodes.length / ITEMS_PER_PAGE);
  const paginatedNodes = sortedNodes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Metadata para el export — refleja LO FILTRADO (no todos los nodos).
  const connectedCount = useMemo(() => sortedNodes.filter(n => n.running).length, [sortedNodes]);
  const activeFilters = useMemo(() => {
    const f: string[] = [];
    if (prefs.searchQuery) f.push(`búsqueda: "${prefs.searchQuery}"`);
    if (prefs.filterProtocol) f.push(`protocolo=${prefs.filterProtocol}`);
    if (prefs.filterStatus) f.push(`estado=${prefs.filterStatus}`);
    return f;
  }, [prefs.searchQuery, prefs.filterProtocol, prefs.filterStatus]);

  const exportRows = useMemo(() => sortedNodes.map(n => ({
    node: n,
    tags: nodeTags[n.ppp_user] || [],
  })), [sortedNodes, nodeTags]);

  const exportMeta = useMemo(() => ({
    totalCount: sortedNodes.length,
    connectedCount,
    activeFilters,
    scannedAt: new Date(),
  }), [sortedNodes.length, connectedCount, activeFilters]);

  return (
    <>
      {/* Banner caché local (MikroTik offline) */}
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-700 font-bold hover:bg-amber-200 transition-colors shrink-0 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/25">
            <RefreshCw className="w-3 h-3" />
            Reintentar
          </button>
        </div>
      )}

      {hasLoaded && nodes.length > 0 && (
        <div className="card overflow-hidden border border-slate-200">

          <NodesFilterBar
            search={prefs.searchQuery}
            onSearchChange={prefs.setSearchQuery}
            filterProtocol={prefs.filterProtocol}
            setFilterProtocol={prefs.setFilterProtocol}
            filterStatus={prefs.filterStatus}
            setFilterStatus={prefs.setFilterStatus}
            visibleCols={prefs.visibleCols}
            setVisibleCols={prefs.setVisibleCols}
            exportSlot={canManage ? (
              <NodesExportMenu
                rows={exportRows}
                meta={exportMeta}
                disabled={sortedNodes.length === 0}
              />
            ) : null}
            resultCount={sortedNodes.length}
            totalCount={nodes.length}
          />

          <NodesTable
            nodes={paginatedNodes}
            nodeTags={nodeTags}
            searchQuery={prefs.searchQuery}
            sortKey={prefs.sortKey}
            sortDir={prefs.sortDir}
            onSort={prefs.toggleSort}
            onEditNode={onEditNode}
            onDeleteNode={onDeleteNode}
            onScriptNode={onScriptNode}
            onDiagnoseNode={onDiagnoseNode}
            onRenameNode={onRenameNode}
            onHistoryNode={onHistoryNode}
            onTagClick={onTagClick}
            canManage={canManage}
            visibleCols={prefs.visibleCols}
          />

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
              <span>Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, sortedNodes.length)} de {sortedNodes.length} nodos</span>
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

      {/* Empty state: Sin nodos */}
      {hasLoaded && nodes.length === 0 && (
        <div className="card border-dashed border-2 border-slate-200 dark:border-slate-700 py-16 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/15 rounded-2xl flex items-center justify-center">
            <Radio className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-slate-500 dark:text-slate-300 font-medium">Sin nodos SSTP</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm">El router no tiene túneles SSTP configurados</p>
        </div>
      )}

      {/* Estado inicial */}
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
