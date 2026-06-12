import { Search, X, Download } from 'lucide-react';

interface NodesFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onExportCsv: () => void;
  resultCount: number;
  totalCount: number;
  /** Permite mostrar el botón Exportar. Falso para MEMBER. */
  canExport?: boolean;
}

export default function NodesFilterBar({
  search,
  onSearchChange,
  onExportCsv,
  resultCount,
  totalCount,
  canExport = true,
}: NodesFilterBarProps) {
  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-white dark:border-slate-800 dark:from-slate-800/30 dark:to-slate-900 flex items-center gap-3">
      {/* Búsqueda */}
      <div className="relative flex-1">
        {/* Dummy inputs para evitar autofill */}
        <input type="text" name="dummy-user" style={{ display: 'none' }} />
        <input type="password" name="dummy-pass" style={{ display: 'none' }} />

        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          name="node-search-filter-off"
          autoComplete="new-password"
          placeholder="Buscar nodo, VRF, red, usuario…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-28 py-3 text-sm rounded-xl border border-slate-200
                     bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                     placeholder:text-slate-400 text-slate-700 transition-all
                     dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {/* Contador de resultados + limpiar */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {search && (
            <span className="text-2xs font-semibold text-slate-400 tabular-nums">
              {resultCount} de {totalCount}
            </span>
          )}
          {search && (
            <button
              onClick={() => onSearchChange('')}
              title="Limpiar búsqueda"
              className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Exportar inventario (acción de tabla, distinta del importar del header) */}
      {canExport && (
        <button onClick={onExportCsv} title="Exportar inventario visible a CSV"
          className="btn-outline flex items-center gap-1.5 px-3 py-2.5 text-xs shrink-0">
          <Download className="w-4 h-4" />
          <span>Exportar</span>
        </button>
      )}
    </div>
  );
}
