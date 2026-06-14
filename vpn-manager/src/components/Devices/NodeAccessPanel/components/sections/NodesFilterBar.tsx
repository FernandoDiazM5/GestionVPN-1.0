// ============================================================
//  NodesFilterBar — toolbar de búsqueda + filtros + acciones de tabla
//
//  §44: replica el patrón de DeviceFilters (§38) para Nodos.
//   • Línea 1: búsqueda + filtro Protocolo + filtro Estado + columnas + export.
//   • Línea 2: chips de filtros activos (search/protocol/status) + contador
//     permanente "X de Y dispositivos".
//
//  Los chips dan affordance "Limpiar" individual sin perder los otros
//  filtros. El contador siempre visible quita ambigüedad sobre cuántos
//  nodos hay tras filtrar.
// ============================================================

import { memo } from 'react';
import { Search, X, Globe, Radio, ShieldOff, KeyRound } from 'lucide-react';
import { NodeColumnPicker } from './NodeColumnPicker';
import type { ProtocolFilter, StatusFilter } from '../../hooks/useNodesPreferences';

interface NodesFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filterProtocol: ProtocolFilter;
  setFilterProtocol: (p: ProtocolFilter) => void;
  filterStatus: StatusFilter;
  setFilterStatus: (s: StatusFilter) => void;
  visibleCols: string[];
  setVisibleCols: (cols: string[]) => void;
  /** Slot donde el padre inyecta el botón/menú de exportar. Falso para MEMBER. */
  exportSlot?: React.ReactNode;
  resultCount: number;
  totalCount: number;
}

const PROTOCOL_LABEL: Record<Exclude<ProtocolFilter, ''>, string> = {
  sstp: 'SSTP',
  wireguard: 'WireGuard',
};
const STATUS_LABEL: Record<Exclude<StatusFilter, ''>, string> = {
  connected: 'Conectados',
  disconnected: 'Desconectados',
};

function NodesFilterBarImpl({
  search, onSearchChange,
  filterProtocol, setFilterProtocol,
  filterStatus, setFilterStatus,
  visibleCols, setVisibleCols,
  exportSlot,
  resultCount, totalCount,
}: NodesFilterBarProps) {
  const hasActiveFilter = !!(search || filterProtocol || filterStatus);

  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-white dark:border-slate-800 dark:from-slate-800/30 dark:to-slate-900 space-y-2">
      {/* Línea 1 — controles */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          {/* Dummy inputs para evitar autofill agresivo de Chrome */}
          <input type="text" name="dummy-user" style={{ display: 'none' }} />
          <input type="password" name="dummy-pass" style={{ display: 'none' }} />

          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
          <input
            type="text"
            name="node-search-filter-off"
            autoComplete="new-password"
            placeholder="Buscar nodo, VRF, red, usuario…"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-11 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500
                       focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                       placeholder:text-slate-400 text-slate-700 transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          value={filterProtocol}
          onChange={e => setFilterProtocol(e.target.value as ProtocolFilter)}
          aria-label="Filtrar por protocolo"
          title="Filtrar por protocolo (SSTP / WireGuard)"
          className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
        >
          <option value="">Todos los protocolos</option>
          <option value="sstp">Solo SSTP</option>
          <option value="wireguard">Solo WireGuard</option>
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as StatusFilter)}
          aria-label="Filtrar por estado del túnel"
          title="Filtrar por estado del túnel (Conectado / Desconectado)"
          className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
        >
          <option value="">Todos los estados</option>
          <option value="connected">Conectados</option>
          <option value="disconnected">Desconectados</option>
        </select>

        <NodeColumnPicker visibleCols={visibleCols} onChange={setVisibleCols} />

        {exportSlot}
      </div>

      {/* Línea 2 — chips + contador permanente */}
      <div className="flex flex-wrap gap-1.5 items-center text-2xs">
        {search && (
          <FilterChip
            label={`"${search}"`}
            onClear={() => onSearchChange('')}
            ariaLabel={`Quitar búsqueda "${search}"`}
          />
        )}
        {filterProtocol && (
          <FilterChip
            icon={filterProtocol === 'sstp'
              ? <KeyRound className="w-2.5 h-2.5" />
              : <Globe className="w-2.5 h-2.5" />}
            label={PROTOCOL_LABEL[filterProtocol]}
            onClear={() => setFilterProtocol('')}
            ariaLabel={`Quitar filtro de protocolo ${PROTOCOL_LABEL[filterProtocol]}`}
          />
        )}
        {filterStatus && (
          <FilterChip
            icon={filterStatus === 'connected'
              ? <Radio className="w-2.5 h-2.5" />
              : <ShieldOff className="w-2.5 h-2.5" />}
            label={STATUS_LABEL[filterStatus]}
            onClear={() => setFilterStatus('')}
            ariaLabel={`Quitar filtro de estado ${STATUS_LABEL[filterStatus]}`}
          />
        )}

        <span className="flex-1" />

        <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          {hasActiveFilter ? (
            <>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{resultCount}</span>
              <span className="text-slate-300 dark:text-slate-600 mx-1">/</span>
              <span>{totalCount}</span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">nodos</span>
            </>
          ) : (
            <>
              <span className="font-bold text-slate-600 dark:text-slate-300">{totalCount}</span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">nodos</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  icon?: React.ReactNode;
  onClear: () => void;
  ariaLabel: string;
}

function FilterChip({ label, icon, onClear, ariaLabel }: FilterChipProps) {
  return (
    <button
      onClick={onClear}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors group dark:bg-indigo-500/15 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
    >
      {icon}
      <span className="font-mono truncate max-w-[140px]">{label}</span>
      <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export default memo(NodesFilterBarImpl);
