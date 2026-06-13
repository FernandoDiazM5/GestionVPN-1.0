// ============================================================
//  DeviceTable — header sticky + body de filas memoizadas
//
//  No introduce virtualización (eso es F10). El header maneja
//  sort (click en label) y resize (drag en el grip). El body
//  delega cada fila a <DeviceTableRow /> memoizada.
// ============================================================

import { memo, useMemo } from 'react';
import { GripVertical, Check, Minus } from 'lucide-react';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import type { ColumnDef, SshAuthStatus } from '../types';
import type { DeviceRow } from '../hooks/useDeviceList';
import { DeviceTableRow } from './DeviceTableRow';

interface DeviceTableProps {
  sortedRows: DeviceRow[];
  activeConfigCols: ColumnDef[];
  gridTemplate: string;
  minTableWidth: number;
  /** T5: oculta la columna fija Nombre/Modelo cuando hay 6+ columnas configurables visibles. */
  compactNameMode: boolean;
  sortConfig: { key: string; dir: 'asc' | 'desc' } | null;
  toggleSort: (key: string) => void;
  startResize: (key: string, startX: number) => void;
  sshStatus: Record<string, SshAuthStatus>;
  expandedRows: Set<string>;
  toggleExpand: (ip: string) => void;
  savedDevices: SavedDevice[];
  selectedNode: NodeInfo | null;
  /** §42-2: ids de filas marcadas para bulk save selectivo. */
  selectedIds: Set<string>;
  /** Toggle de selección para una fila. */
  onToggleSelected: (devId: string) => void;
  /** Selecciona todas las filas candidatas visibles (SSH OK + no guardadas). */
  onSelectAllVisibleCandidates: () => void;
  /** Limpia toda la selección. */
  onClearSelection: () => void;
  /** Cuántas filas candidatas visibles hay (informativo para el checkbox del header). */
  visibleCandidateCount: number;
  onOpenM5Detail: (dev: ScannedDevice) => void;
  onSyncToSaved: (dev: ScannedDevice, savedDev: SavedDevice) => void;
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => void;
  onOpenAddModal: (dev: ScannedDevice) => void;
  onRefreshStats: (ip: string, stats: AntennaStats) => void;
}

function DeviceTableImpl(props: DeviceTableProps) {
  const {
    sortedRows, activeConfigCols, gridTemplate, minTableWidth, compactNameMode,
    sortConfig, toggleSort, startResize, sshStatus, expandedRows, toggleExpand,
    savedDevices, selectedNode,
    selectedIds, onToggleSelected, onSelectAllVisibleCandidates, onClearSelection,
    visibleCandidateCount,
    onOpenM5Detail, onSyncToSaved,
    onDirectSave, onOpenAddModal, onRefreshStats,
  } = props;

  // Tri-state del checkbox del header. Si hay candidatos visibles y todos están
  // seleccionados → marcado completo; si algunos sí y otros no → indeterminate;
  // si ninguno → vacío. Cuando no hay candidatos visibles el checkbox se
  // deshabilita (nada que seleccionar masivamente).
  const selectedCandidateCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    let n = 0;
    for (const row of sortedRows) {
      if (selectedIds.has(row.devId) && !row.isSaved && sshStatus[row.dev.ip] === 'success') n++;
    }
    return n;
  }, [sortedRows, selectedIds, sshStatus]);

  const headerCheckState: 'empty' | 'partial' | 'full' =
    visibleCandidateCount === 0 ? 'empty'
      : selectedCandidateCount === 0 ? 'empty'
      : selectedCandidateCount >= visibleCandidateCount ? 'full'
      : 'partial';

  const handleHeaderCheckboxClick = () => {
    if (visibleCandidateCount === 0) return;
    if (headerCheckState === 'full') onClearSelection();
    else onSelectAllVisibleCandidates();
  };

  // Setea gridTemplate como CSS variable a nivel del contenedor.
  // El header y todas las filas leen var(--cols-tpl), así que al cambiar el
  // ancho de una columna durante un drag solo este contenedor re-renderiza —
  // las filas no invalidan su memo (su prop gridTemplate ya no varía).
  const containerStyle: React.CSSProperties & Record<'--cols-tpl', string> = {
    minWidth: `${minTableWidth}px`,
    '--cols-tpl': gridTemplate,
  };

  // Lookup O(1) del SavedDevice por id. Antes era Array.find por fila →
  // O(n·m) con n filas escaneadas × m saved.
  const savedById = useMemo(
    () => new Map(savedDevices.map(d => [d.id, d])),
    [savedDevices],
  );

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
      <div style={containerStyle}>

        {/* Header sticky */}
        <div
          className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider rounded-tl-xl rounded-tr-xl dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
          style={{ display: 'grid', gridTemplateColumns: 'var(--cols-tpl)' }}
        >
          {/* §42-2: checkbox de selección masiva — afecta solo a candidatos
              (SSH OK + no guardados). Tri-state. */}
          <div className="px-1 py-3 flex items-center justify-center">
            <button
              onClick={handleHeaderCheckboxClick}
              disabled={visibleCandidateCount === 0}
              title={
                visibleCandidateCount === 0
                  ? 'No hay candidatos para guardar (necesitan SSH OK + no estar guardados)'
                  : headerCheckState === 'full'
                    ? 'Deseleccionar todos'
                    : `Seleccionar ${visibleCandidateCount} candidato${visibleCandidateCount !== 1 ? 's' : ''} visible${visibleCandidateCount !== 1 ? 's' : ''}`
              }
              aria-label="Seleccionar candidatos para guardar"
              aria-checked={
                headerCheckState === 'full' ? 'true'
                  : headerCheckState === 'partial' ? 'mixed'
                  : 'false'
              }
              role="checkbox"
              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                ${visibleCandidateCount === 0
                  ? 'border-slate-300 bg-slate-50 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800'
                  : headerCheckState === 'full'
                    ? 'border-emerald-500 bg-emerald-500 hover:bg-emerald-600 hover:border-emerald-600'
                    : headerCheckState === 'partial'
                      ? 'border-emerald-500 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/30'
                      : 'border-slate-400 hover:border-emerald-500 dark:border-slate-500'}`}
            >
              {headerCheckState === 'full' && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              {headerCheckState === 'partial' && <Minus className="w-3 h-3 text-emerald-700" strokeWidth={3} />}
            </button>
          </div>
          <div className="px-3 py-3 text-center">SSH</div>
          <div className="px-3 py-3">Rol</div>
          <div
            className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
            onClick={() => toggleSort('ip')}
          >
            IP / MAC
            {sortConfig?.key === 'ip' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          {!compactNameMode && (
            <div
              className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
              onClick={() => toggleSort('name')}
            >
              Nombre / Modelo
              {sortConfig?.key === 'name' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
            </div>
          )}
          {activeConfigCols.map(col => (
            <div
              key={col.key}
              title={col.label}
              className="px-3 py-3 min-w-0 overflow-hidden select-none flex items-center gap-1 hover:text-slate-700 relative group"
            >
              <span
                className="cursor-pointer flex items-center gap-1 flex-1 min-w-0 truncate"
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortConfig?.key === col.key && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
              </span>
              <span
                title="Arrastra para redimensionar"
                className="cursor-col-resize opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 shrink-0 select-none"
                onMouseDown={e => {
                  e.preventDefault();
                  startResize(col.key, e.clientX);
                }}
              >
                <GripVertical className="w-3 h-3" />
              </span>
            </div>
          ))}
          <div className="px-3 py-3" />
          {/* Acción sticky-right (U1.A): siempre visible aunque la tabla scrolle
              horizontalmente. Shadow sutil hacia la izquierda marca que está
              flotando sobre las columnas previas cuando hay overflow. */}
          <div className="px-3 py-3 text-right sticky right-0 z-10 bg-slate-100 dark:bg-slate-800 shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)]">
            Acción
          </div>
        </div>

        {/* Body */}
        {sortedRows.map(({ dev, isSaved, devId }, rowIdx) => {
          const savedDevice = isSaved ? (savedById.get(devId) ?? null) : null;
          return (
          <DeviceTableRow
            key={dev.ip}
            dev={dev}
            isSaved={isSaved}
            rowIdx={rowIdx}
            sshStatus={sshStatus[dev.ip]}
            isExpanded={expandedRows.has(dev.ip)}
            activeConfigCols={activeConfigCols}
            compactNameMode={compactNameMode}
            selectedNode={selectedNode}
            savedDevice={savedDevice}
            isSelected={selectedIds.has(devId)}
            onToggleSelected={onToggleSelected}
            onToggleExpand={toggleExpand}
            onOpenM5Detail={onOpenM5Detail}
            onSyncToSaved={onSyncToSaved}
            onDirectSave={onDirectSave}
            onOpenAddModal={onOpenAddModal}
            onRefreshStats={onRefreshStats}
          />
          );
        })}
      </div>
    </div>
  );
}

export const DeviceTable = memo(DeviceTableImpl);
