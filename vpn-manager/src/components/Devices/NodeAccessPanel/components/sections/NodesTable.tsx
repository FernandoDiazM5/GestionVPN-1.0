import { useSyncExternalStore } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import NodeCard from '../../../../VPN/NodeCard';
import type { NodeInfo } from '../../../../../types/api';

export type SortKey = 'default' | 'nombre_nodo' | 'nombre_vrf' | 'ip_tunnel' | 'running';
export type SortDir = 'asc' | 'desc';

const MOBILE_SITES_QUERY = '(max-width: 639px)';

function subscribeToMobileSites(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(MOBILE_SITES_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function getMobileSitesSnapshot() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_SITES_QUERY).matches;
}

interface NodesTableProps {
  nodes: NodeInfo[];
  nodeTags: Record<string, string[]>;
  searchQuery: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onEditNode: (node: NodeInfo) => void;
  onDeleteNode: (node: NodeInfo) => void;
  onScriptNode: (node: NodeInfo) => void;
  onRenameNode: (node: NodeInfo, newName: string) => void;
  onHistoryNode: (node: NodeInfo) => void;
  onTagClick: (node: NodeInfo) => void;
  onDiagnoseNode: (node: NodeInfo) => void;
  /** Permite mostrar el kebab de acciones por fila. Falso para MEMBER. */
  canManage?: boolean;
  /** §44: columnas opcionales visibles. Las fijas (estado/nombre/acciones)
   *  siempre se renderizan. */
  visibleCols: string[];
}

// Mapa key→{label, sortKey?}. sortKey opcional: solo algunas columnas sortean.
const COL_HEADER_META: Record<string, { label: string; sortKey?: SortKey }> = {
  vrf:       { label: 'Ruta asignada', sortKey: 'nombre_vrf' },
  lan:       { label: 'Red del sitio' },
  ip_tunnel: { label: 'Dirección de conexión', sortKey: 'ip_tunnel' },
  ppp_user:  { label: 'Identificador de acceso' },
  tags:      { label: 'Etiquetas' },
  service:   { label: 'Tipo de conexión' },
  disabled:  { label: 'Disponibilidad' },
  uptime:    { label: 'Tiempo en línea' },
};

interface SortableHeaderProps {
  label: string;
  columnKey: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onSort: (key: SortKey) => void;
}

function SortableHeader({ label, columnKey, activeKey, direction, onSort }: SortableHeaderProps) {
  const active = activeKey === columnKey;
  const nextDirection = active && direction === 'asc' ? 'descendente' : 'ascendente';

  return (
    <th
      className="p-0 text-left text-2xs font-bold tracking-wide text-slate-500 transition-colors hover:bg-slate-100 group dark:text-slate-400 dark:hover:bg-slate-800"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        aria-label={`Ordenar por ${label} ${nextDirection}`}
        className="flex min-h-11 w-full items-center px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
      >
        {label}
        {!active && <ArrowUpDown aria-hidden="true" className="ml-1 h-3 w-3 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:text-slate-500" />}
        {active && direction === 'asc' && <ArrowUp aria-hidden="true" className="ml-1 h-3 w-3 text-indigo-500" />}
        {active && direction === 'desc' && <ArrowDown aria-hidden="true" className="ml-1 h-3 w-3 text-indigo-500" />}
      </button>
    </th>
  );
}

export default function NodesTable({
  nodes,
  nodeTags,
  searchQuery,
  sortKey,
  sortDir,
  onSort,
  onEditNode,
  onDeleteNode,
  onScriptNode,
  onRenameNode,
  onHistoryNode,
  onTagClick,
  onDiagnoseNode,
  canManage = true,
  visibleCols,
}: NodesTableProps) {

  // Filtramos a las claves válidas conocidas; preserva el orden del usuario.
  const orderedCols = visibleCols.filter(k => COL_HEADER_META[k]);
  // colspan para "Sin resultados": fixed cols (status + nombre + acciones) + opcionales visibles.
  const totalCols = 3 + orderedCols.length;
  const isMobile = useSyncExternalStore(subscribeToMobileSites, getMobileSitesSnapshot, () => false);

  if (isMobile) {
    return (
      <section className="space-y-2 px-3 pb-3" aria-label="Sitios remotos en vista móvil">
        {nodes.length > 0 && (
          <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {nodes.length} {nodes.length === 1 ? 'sitio' : 'sitios'}
          </div>
        )}
        {nodes.map((node, idx) => (
          <NodeCard key={node.id} node={node} rowIndex={idx} mobile
            onEdit={() => onEditNode(node)} onDelete={() => onDeleteNode(node)} onScript={() => onScriptNode(node)}
            onRename={(newName) => onRenameNode(node, newName)} onHistory={() => onHistoryNode(node)}
            onTagClick={() => onTagClick(node)} onDiagnose={() => onDiagnoseNode(node)}
            tags={nodeTags[node.ppp_user] || []} canManage={canManage} visibleCols={orderedCols} />
        ))}
        {nodes.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 px-4 py-12 text-center dark:border-slate-700">
            <Search className="h-8 w-8 text-slate-500" />
            <p className="font-semibold text-slate-600 dark:text-slate-300">No encontramos sitios con esos filtros</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {searchQuery ? `Prueba con otro nombre o ubicación en lugar de "${searchQuery}"` : 'Cambia o limpia los filtros para ver más resultados'}
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <div
      className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
      role="region"
      aria-label="Sitios remotos. Desplaza horizontalmente para ver todos los datos."
      tabIndex={0}
    >
      <table className="w-full min-w-[760px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 select-none dark:border-slate-800 dark:bg-slate-800/50">
            {/* Fija: Estado */}
            <th className="h-11 w-11 px-0 py-0" aria-label="Estado" />

            {/* Fija: Nodo (sortable) */}
            <SortableHeader label="Sitio" columnKey="nombre_nodo" activeKey={sortKey} direction={sortDir} onSort={onSort} />

            {/* Opcionales dinámicas */}
            {orderedCols.map(key => {
              const meta = COL_HEADER_META[key];
              const sortable = !!meta.sortKey;
              return (
                sortable ? (
                  <SortableHeader
                    key={key}
                    label={meta.label}
                    columnKey={meta.sortKey!}
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={onSort}
                  />
                ) : (
                  <th key={key} className="h-11 px-4 text-left text-2xs font-bold tracking-wide text-slate-500 dark:text-slate-400">
                    {meta.label}
                  </th>
                )
              );
            })}

            {/* Fija: Acciones — §44 sticky-right (patrón §39 de Escanear).
                Shadow sutil hacia la izquierda marca que está flotando
                cuando hay overflow horizontal. */}
            <th className="sticky right-0 z-20 border-l border-slate-200 bg-slate-50 px-4 py-3 text-right text-2xs font-bold tracking-wide text-slate-500 shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Opciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {nodes.map((node, idx) => (
            <NodeCard
              key={node.id}
              node={node}
              rowIndex={idx}
              onEdit={() => onEditNode(node)}
              onDelete={() => onDeleteNode(node)}
              onScript={() => onScriptNode(node)}
              onRename={(newName) => onRenameNode(node, newName)}
              onHistory={() => onHistoryNode(node)}
              onTagClick={() => onTagClick(node)}
              onDiagnose={() => onDiagnoseNode(node)}
              tags={nodeTags[node.ppp_user] || []}
              canManage={canManage}
              visibleCols={orderedCols}
            />
          ))}
          {nodes.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <Search className="w-8 h-8 text-slate-500 dark:text-slate-500" />
                  <p className="text-slate-600 dark:text-slate-300 font-semibold">No encontramos sitios con esos filtros</p>
                  <p className="text-slate-500 dark:text-slate-400 text-xs">
                    {searchQuery ? `Prueba con otro nombre o ubicación en lugar de "${searchQuery}"` : 'Cambia o limpia los filtros para ver más resultados'}
                  </p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
