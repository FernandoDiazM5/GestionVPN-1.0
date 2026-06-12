// ============================================================
//  DeviceFilters — toolbar de búsqueda + filtros + contador
//
//  Estructura:
//   • Línea 1: search + select SSID + select Rol
//   • Línea 2: chips de filtros activos (search/SSID/rol) + contador
//
//  El contador "X de Y" SIEMPRE es visible (antes solo aparecía con
//  filtro activo). Los chips dan affordance "Limpiar" individual.
// ============================================================

import { memo } from 'react';
import { Search, X, Radio, Cpu, HelpCircle } from 'lucide-react';
import type { RoleFilter } from '../hooks/useDeviceList';

interface DeviceFiltersProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterSSID: string;
  setFilterSSID: (s: string) => void;
  filterRole: RoleFilter;
  setFilterRole: (r: RoleFilter) => void;
  uniqueSSIDs: string[];
  filteredCount: number;
  totalCount: number;
}

const ROLE_LABEL: Record<Exclude<RoleFilter, ''>, string> = {
  ap: 'AP',
  sta: 'CPE',
  unknown: 'Desconocido',
};

function DeviceFiltersImpl({
  searchQuery, setSearchQuery,
  filterSSID, setFilterSSID,
  filterRole, setFilterRole,
  uniqueSSIDs, filteredCount, totalCount,
}: DeviceFiltersProps) {
  const hasActiveFilter = !!(searchQuery || filterSSID || filterRole);

  return (
    <div className="space-y-2 px-1 py-2">
      {/* Toolbar de inputs */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar IP, nombre, MAC..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-300 hover:text-slate-500 rounded transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filtro por rol */}
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as RoleFilter)}
          aria-label="Filtrar por rol del dispositivo"
          title="Filtrar por rol (AP / CPE / Desconocido)"
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
        >
          <option value="">Todos los roles</option>
          <option value="ap">Solo APs</option>
          <option value="sta">Solo CPEs</option>
          <option value="unknown">Solo desconocidos</option>
        </select>

        {uniqueSSIDs.length > 0 && (
          <select
            value={filterSSID}
            onChange={e => setFilterSSID(e.target.value)}
            aria-label="Filtrar por SSID"
            title="Filtrar por SSID del AP"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
          >
            <option value="">Todos los AP</option>
            {uniqueSSIDs.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {/* Línea 2: chips activos + contador permanente */}
      <div className="flex flex-wrap gap-1.5 items-center text-2xs">
        {searchQuery && (
          <FilterChip
            label={`"${searchQuery}"`}
            onClear={() => setSearchQuery('')}
            ariaLabel={`Quitar búsqueda "${searchQuery}"`}
          />
        )}
        {filterRole && (
          <FilterChip
            icon={
              filterRole === 'ap' ? <Radio className="w-2.5 h-2.5" /> :
              filterRole === 'sta' ? <Cpu className="w-2.5 h-2.5" /> :
              <HelpCircle className="w-2.5 h-2.5" />
            }
            label={ROLE_LABEL[filterRole]}
            onClear={() => setFilterRole('')}
            ariaLabel={`Quitar filtro de rol ${ROLE_LABEL[filterRole]}`}
          />
        )}
        {filterSSID && (
          <FilterChip
            label={filterSSID}
            onClear={() => setFilterSSID('')}
            ariaLabel={`Quitar filtro de SSID ${filterSSID}`}
          />
        )}

        {/* Spacer empuja el contador a la derecha */}
        <span className="flex-1" />

        <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          {hasActiveFilter ? (
            <>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{filteredCount}</span>
              <span className="text-slate-300 dark:text-slate-600 mx-1">/</span>
              <span>{totalCount}</span>
              <span className="ml-1 text-slate-400">dispositivos</span>
            </>
          ) : (
            <>
              <span className="font-bold text-slate-600 dark:text-slate-300">{totalCount}</span>
              <span className="ml-1 text-slate-400">dispositivos</span>
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
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors group
        dark:bg-indigo-500/15 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
    >
      {icon}
      <span className="font-mono truncate max-w-[120px]">{label}</span>
      <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export const DeviceFilters = memo(DeviceFiltersImpl);
