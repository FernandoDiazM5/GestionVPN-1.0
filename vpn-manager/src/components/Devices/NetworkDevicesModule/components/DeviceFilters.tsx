// ============================================================
//  DeviceFilters — toolbar de búsqueda + filtro SSID
//
//  Una sola fila con: input de búsqueda (IP/MAC/nombre/SSID),
//  selector de SSID disponibles y contador "x de y" cuando hay
//  filtro activo.
// ============================================================

import { memo } from 'react';
import { Search } from 'lucide-react';

interface DeviceFiltersProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterSSID: string;
  setFilterSSID: (s: string) => void;
  uniqueSSIDs: string[];
  filteredCount: number;
  totalCount: number;
}

function DeviceFiltersImpl({
  searchQuery, setSearchQuery, filterSSID, setFilterSSID,
  uniqueSSIDs, filteredCount, totalCount,
}: DeviceFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2 px-1 py-2 items-center">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar IP, nombre, MAC..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs">✕</button>
        )}
      </div>
      {uniqueSSIDs.length > 0 && (
        <select
          value={filterSSID}
          onChange={e => setFilterSSID(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600"
        >
          <option value="">Todos los AP</option>
          {uniqueSSIDs.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
      {(searchQuery || filterSSID) && (
        <span className="text-xs text-slate-400">
          {filteredCount} de {totalCount} dispositivos
        </span>
      )}
    </div>
  );
}

export const DeviceFilters = memo(DeviceFiltersImpl);
