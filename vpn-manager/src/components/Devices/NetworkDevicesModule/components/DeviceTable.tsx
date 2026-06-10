// ============================================================
//  DeviceTable — header sticky + body de filas memoizadas
//
//  No introduce virtualización (eso es F10). El header maneja
//  sort (click en label) y resize (drag en el grip). El body
//  delega cada fila a <DeviceTableRow /> memoizada.
// ============================================================

import { memo } from 'react';
import { GripVertical } from 'lucide-react';
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
  colWidths: Record<string, number>;
  sortConfig: { key: string; dir: 'asc' | 'desc' } | null;
  toggleSort: (key: string) => void;
  startResize: (key: string, startX: number) => void;
  sshStatus: Record<string, SshAuthStatus>;
  expandedRows: Set<string>;
  toggleExpand: (ip: string) => void;
  savedDevices: SavedDevice[];
  selectedNode: NodeInfo | null;
  onOpenM5Detail: (dev: ScannedDevice) => void;
  onSyncToSaved: (dev: ScannedDevice, savedDev: SavedDevice) => void;
  onOpenSavedView: (saved: SavedDevice) => void;
  onOpenScanView: (dev: ScannedDevice) => void;
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => void;
  onOpenAddModal: (dev: ScannedDevice) => void;
  onRefreshStats: (ip: string, stats: AntennaStats) => void;
}

function DeviceTableImpl(props: DeviceTableProps) {
  const {
    sortedRows, activeConfigCols, gridTemplate, minTableWidth, colWidths,
    sortConfig, toggleSort, startResize, sshStatus, expandedRows, toggleExpand,
    savedDevices, selectedNode,
    onOpenM5Detail, onSyncToSaved, onOpenSavedView, onOpenScanView,
    onDirectSave, onOpenAddModal, onRefreshStats,
  } = props;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
      <div style={{ minWidth: `${minTableWidth}px` }}>

        {/* Header sticky */}
        <div
          className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider rounded-tl-xl rounded-tr-xl dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
          style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
        >
          <div className="px-3 py-3 text-center">SSH</div>
          <div className="px-3 py-3">Rol</div>
          <div
            className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
            onClick={() => toggleSort('ip')}
          >
            IP / MAC
            {sortConfig?.key === 'ip' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          <div
            className="px-3 py-3 cursor-pointer select-none flex items-center gap-1 hover:text-slate-700"
            onClick={() => toggleSort('name')}
          >
            Nombre / Modelo
            {sortConfig?.key === 'name' && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          {activeConfigCols.map(col => (
            <div
              key={col.key}
              className="px-3 py-3 min-w-0 overflow-hidden select-none flex items-center gap-1 hover:text-slate-700 relative group"
            >
              <span className="cursor-pointer flex items-center gap-1 flex-1 min-w-0 truncate" onClick={() => toggleSort(col.key)}>
                {col.label}
                {sortConfig?.key === col.key && <span className="text-indigo-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
              </span>
              <span
                title="Arrastra para redimensionar"
                className="cursor-col-resize opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 shrink-0 select-none"
                onMouseDown={e => {
                  e.preventDefault();
                  startResize(col.key, e.clientX);
                  // Forzar referencia para silenciar el linter (colWidths se usa internamente en useColumnPrefs)
                  void colWidths;
                }}
              >
                <GripVertical className="w-3 h-3" />
              </span>
            </div>
          ))}
          <div className="px-3 py-3" />
          <div className="px-3 py-3 text-right">Acción</div>
        </div>

        {/* Body */}
        {sortedRows.map(({ dev, isSaved, devId }, rowIdx) => {
          const savedDevice = isSaved ? (savedDevices.find(s => s.id === devId) ?? null) : null;
          return (
          <DeviceTableRow
            key={dev.ip}
            dev={dev}
            isSaved={isSaved}
            rowIdx={rowIdx}
            sshStatus={sshStatus[dev.ip]}
            isExpanded={expandedRows.has(dev.ip)}
            activeConfigCols={activeConfigCols}
            gridTemplate={gridTemplate}
            selectedNode={selectedNode}
            savedDevice={savedDevice}
            onToggleExpand={toggleExpand}
            onOpenM5Detail={onOpenM5Detail}
            onSyncToSaved={onSyncToSaved}
            onOpenSavedView={onOpenSavedView}
            onOpenScanView={onOpenScanView}
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
