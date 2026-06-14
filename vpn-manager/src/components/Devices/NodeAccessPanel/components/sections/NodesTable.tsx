import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import NodeCard from '../../../../VPN/NodeCard';
import type { NodeInfo } from '../../../../../types/api';

export type SortKey = 'default' | 'nombre_nodo' | 'nombre_vrf' | 'ip_tunnel' | 'running';
export type SortDir = 'asc' | 'desc';

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
  vrf:       { label: 'VRF',          sortKey: 'nombre_vrf' },
  lan:       { label: 'Red LAN' },
  ip_tunnel: { label: 'IP Túnel',     sortKey: 'ip_tunnel' },
  ppp_user:  { label: 'Usuario PPP' },
  tags:      { label: 'Etiquetas' },
  service:   { label: 'Protocolo' },
  disabled:  { label: 'Habilitado' },
  uptime:    { label: 'Tiempo activo' },
};

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

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-400 dark:text-slate-500 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-indigo-500 ml-1" />
      : <ArrowDown className="w-3 h-3 text-indigo-500 ml-1" />;
  };

  // Filtramos a las claves válidas conocidas; preserva el orden del usuario.
  const orderedCols = visibleCols.filter(k => COL_HEADER_META[k]);
  // colspan para "Sin resultados": fixed cols (status + nombre + acciones) + opcionales visibles.
  const totalCols = 3 + orderedCols.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 select-none dark:border-slate-800 dark:bg-slate-800/50">
            {/* Fija: Estado */}
            <th className="px-4 py-3 w-10" aria-label="Estado" />

            {/* Fija: Nodo (sortable) */}
            <th
              className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-wider text-2xs cursor-pointer hover:bg-slate-100 group transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
              onClick={() => onSort('nombre_nodo')}
            >
              <div className="flex items-center">
                Nodo <SortIcon columnKey="nombre_nodo" />
              </div>
            </th>

            {/* Opcionales dinámicas */}
            {orderedCols.map(key => {
              const meta = COL_HEADER_META[key];
              const sortable = !!meta.sortKey;
              return (
                <th
                  key={key}
                  className={`px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-wider text-2xs dark:text-slate-400 ${sortable ? 'cursor-pointer hover:bg-slate-100 group transition-colors dark:hover:bg-slate-800' : ''}`}
                  onClick={sortable ? () => onSort(meta.sortKey!) : undefined}
                >
                  <div className="flex items-center">
                    {meta.label}
                    {sortable && <SortIcon columnKey={meta.sortKey!} />}
                  </div>
                </th>
              );
            })}

            {/* Fija: Acciones — §44 sticky-right (patrón §39 de Escanear).
                Shadow sutil hacia la izquierda marca que está flotando
                cuando hay overflow horizontal. */}
            <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase tracking-wider text-2xs sticky right-0 z-10 bg-slate-50 shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)] dark:text-slate-400 dark:bg-slate-800/50">
              Acciones
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
                  <Search className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                  <p className="text-slate-500 dark:text-slate-400 font-semibold">Sin resultados</p>
                  <p className="text-slate-500 dark:text-slate-400 text-xs">
                    {searchQuery ? `No se encontraron nodos coincidentes con "${searchQuery}"` : 'No hay nodos para mostrar'}
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
