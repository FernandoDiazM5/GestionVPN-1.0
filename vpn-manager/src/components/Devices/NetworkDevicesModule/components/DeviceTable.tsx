// ============================================================
//  DeviceTable — header sticky + body de filas memoizadas
//
//  No introduce virtualización (eso es F10). El header maneja
//  sort (click en label) y resize (drag en el grip). El body
//  delega cada fila a <DeviceTableRow /> memoizada.
// ============================================================

import { memo, useMemo, useSyncExternalStore } from 'react';
import { GripVertical, Check, Minus } from 'lucide-react';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import type { ColumnDef, SshAuthStatus } from '../types';
import type { DeviceRow } from '../hooks/useDeviceList';
import { DeviceMobileRow, DeviceTableRow } from './DeviceTableRow';

const MOBILE_TABLE_QUERY = '(max-width: 639px)';

function subscribeToMobileTable(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(MOBILE_TABLE_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function getMobileTableSnapshot() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_TABLE_QUERY).matches;
}

interface DeviceTableProps {
  sortedRows: DeviceRow[];
  activeConfigCols: ColumnDef[];
  gridTemplate: string;
  minTableWidth: number;
  /** T5: oculta la columna fija Nombre/Modelo cuando hay 6+ columnas configurables visibles. */
  compactNameMode: boolean;
  sortConfig: { key: string; dir: 'asc' | 'desc' } | null;
  toggleSort: (key: string) => void;
  startResize: (key: string, startX: number, keyboardDelta?: number) => void;
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
  /** §42 fix: mapa MAC (sin separadores, upper) → nombre del dispositivo. Lo
   *  usa DeviceStatusPanel para resolver el hostname de cada estación cuando el
   *  AP no lo provee (cross-reference con los datos del scan). */
  stationNamesByMac: Map<string, string>;
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
    visibleCandidateCount, stationNamesByMac,
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

  const isMobileTable = useSyncExternalStore(
    subscribeToMobileTable,
    getMobileTableSnapshot,
    () => false,
  );

  if (isMobileTable) {
    return (
      <section
        className="space-y-2"
        aria-label="Equipos encontrados en vista móvil"
      >
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <span>{sortedRows.length} dispositivo{sortedRows.length !== 1 ? 's' : ''}</span>
          {visibleCandidateCount > 0 && (
            <button
              type="button"
              onClick={handleHeaderCheckboxClick}
              aria-checked={headerCheckState === 'full' ? 'true' : headerCheckState === 'partial' ? 'mixed' : 'false'}
              role="checkbox"
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-emerald-400"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors
                ${headerCheckState === 'full'
                  ? 'border-emerald-500 bg-emerald-500'
                  : headerCheckState === 'partial'
                    ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/30'
                    : 'border-slate-400 dark:border-slate-500'}`}>
                {headerCheckState === 'full' && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                {headerCheckState === 'partial' && <Minus className="h-3 w-3 text-emerald-700" strokeWidth={3} />}
              </span>
              <span>{headerCheckState === 'full' ? 'Quitar todos' : 'Seleccionar'}</span>
            </button>
          )}
        </div>

        {sortedRows.map(({ dev, isSaved, devId }, rowIdx) => (
          <DeviceMobileRow
            key={dev.ip}
            dev={dev}
            isSaved={isSaved}
            rowIdx={rowIdx}
            sshStatus={sshStatus[dev.ip]}
            isExpanded={expandedRows.has(dev.ip)}
            activeConfigCols={activeConfigCols}
            selectedNode={selectedNode}
            savedDevice={isSaved ? (savedById.get(devId) ?? null) : null}
            isSelected={selectedIds.has(devId)}
            onToggleSelected={onToggleSelected}
            onToggleExpand={toggleExpand}
            stationNamesByMac={stationNamesByMac}
            onOpenM5Detail={onOpenM5Detail}
            onSyncToSaved={onSyncToSaved}
            onDirectSave={onDirectSave}
            onOpenAddModal={onOpenAddModal}
            onRefreshStats={onRefreshStats}
          />
        ))}
      </section>
    );
  }

  return (
    <div
      className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 dark:border-slate-700"
      role="region"
      aria-label="Dispositivos escaneados. Desplaza horizontalmente para ver todas las columnas."
      tabIndex={0}
    >
      <div role="table" aria-rowcount={sortedRows.length + 1} style={containerStyle}>

        {/* Header sticky */}
        <div
          role="row"
          className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider rounded-tl-xl rounded-tr-xl dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
          style={{ display: 'grid', gridTemplateColumns: 'var(--cols-tpl)' }}
        >
          {/* §42-2: checkbox de selección masiva — afecta solo a candidatos
              (SSH OK + no guardados). Tri-state. */}
          <div role="columnheader" className="flex min-h-11 items-center justify-center">
            <button
              type="button"
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
              className="group/check flex h-11 w-11 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 disabled:cursor-not-allowed"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors
                ${visibleCandidateCount === 0
                  ? 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                  : headerCheckState === 'full'
                    ? 'border-emerald-500 bg-emerald-500 group-hover/check:bg-emerald-600'
                    : headerCheckState === 'partial'
                      ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/30'
                      : 'border-slate-400 dark:border-slate-500'}`}>
                {headerCheckState === 'full' && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                {headerCheckState === 'partial' && <Minus className="w-3 h-3 text-emerald-700" strokeWidth={3} />}
              </span>
            </button>
          </div>
          <div role="columnheader" className="px-3 py-3 text-center">SSH</div>
          <div role="columnheader" className="px-3 py-3">Rol</div>
          <div
            role="columnheader"
            aria-sort={sortConfig?.key === 'ip' ? (sortConfig.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            className="min-w-0"
          >
            <button
              type="button"
              onClick={() => toggleSort('ip')}
              aria-label={`Ordenar por IP / MAC ${sortConfig?.key === 'ip' && sortConfig.dir === 'asc' ? 'descendente' : 'ascendente'}`}
              className="flex min-h-11 w-full items-center gap-1 px-3 text-left hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:text-slate-100"
            >
              IP / MAC
              {sortConfig?.key === 'ip' && <span aria-hidden="true" className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          </div>
          {!compactNameMode && (
            <div
              role="columnheader"
              aria-sort={sortConfig?.key === 'name' ? (sortConfig.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className="min-w-0"
            >
              <button
                type="button"
                onClick={() => toggleSort('name')}
                aria-label={`Ordenar por Nombre / Modelo ${sortConfig?.key === 'name' && sortConfig.dir === 'asc' ? 'descendente' : 'ascendente'}`}
                className="flex min-h-11 w-full items-center gap-1 px-3 text-left hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:text-slate-100"
              >
                Nombre / Modelo
                {sortConfig?.key === 'name' && <span aria-hidden="true" className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            </div>
          )}
          {activeConfigCols.map(col => (
            <div
              key={col.key}
              role="columnheader"
              aria-sort={sortConfig?.key === col.key ? (sortConfig.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              title={col.label}
              className="relative flex min-w-0 items-center overflow-hidden hover:text-slate-700 dark:hover:text-slate-100"
            >
              <button
                type="button"
                className="flex min-h-11 min-w-0 flex-1 items-center gap-1 truncate px-3 pr-11 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                onClick={() => toggleSort(col.key)}
                aria-label={`Ordenar por ${col.label} ${sortConfig?.key === col.key && sortConfig.dir === 'asc' ? 'descendente' : 'ascendente'}`}
              >
                <span className="truncate">{col.label}</span>
                {sortConfig?.key === col.key && <span aria-hidden="true" className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
              </button>
              <button
                type="button"
                title="Redimensionar columna. Usa Flecha izquierda o Flecha derecha."
                aria-label={`Redimensionar columna ${col.label}`}
                aria-keyshortcuts="ArrowLeft ArrowRight"
                className="absolute right-0 top-0 flex h-11 w-11 cursor-col-resize items-center justify-center text-slate-500 opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-slate-400"
                onMouseDown={e => {
                  e.preventDefault();
                  startResize(col.key, e.clientX);
                }}
                onKeyDown={e => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault();
                  startResize(col.key, 0, e.key === 'ArrowLeft' ? -10 : 10);
                }}
              >
                <GripVertical className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div role="columnheader" className="px-3 py-3" />
          {/* Acción sticky-right (U1.A): siempre visible aunque la tabla scrolle
              horizontalmente. Shadow sutil hacia la izquierda marca que está
              flotando sobre las columnas previas cuando hay overflow. */}
          <div role="columnheader" className="px-3 py-3 text-right sticky right-0 z-10 bg-slate-100 dark:bg-slate-800 shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)]">
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
            stationNamesByMac={stationNamesByMac}
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
