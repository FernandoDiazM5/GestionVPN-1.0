// ============================================================
//  DeviceTableRow — fila individual de la tabla, memoizada
//
//  memo() evita re-renders cuando cambian filas vecinas. Solo
//  re-renderiza si su dev/isSaved/sshStatus/isExpanded cambian.
//  El expand toggle abre <DeviceStatusPanel /> bajo la fila.
// ============================================================

import { memo, Fragment } from 'react';
import {
  CheckCircle2, X, Loader2, ChevronDown, ChevronRight,
  Sparkles, RefreshCw, PlusCircle, Save, Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import type { ColumnDef, SshAuthStatus } from '../types';
import { DeviceStatusPanel } from './DeviceStatusPanel';

interface DeviceTableRowProps {
  dev: ScannedDevice;
  isSaved: boolean;
  isSaving: boolean;
  rowIdx: number;
  sshStatus: SshAuthStatus | undefined;
  isExpanded: boolean;
  activeConfigCols: ColumnDef[];
  /**
   * `gridTemplate` ya no llega como prop — se lee como CSS variable
   * `--cols-tpl` del contenedor padre. Durante un drag de resize, solo
   * `DeviceTable` re-renderiza; las filas siguen memoizadas estables.
   */
  selectedNode: NodeInfo | null;
  savedDevice: SavedDevice | null;
  /** §42-2: si la fila está seleccionada para bulk save. */
  isSelected: boolean;
  /** Toggle de selección — se invoca al click en el checkbox de la fila. */
  onToggleSelected: (devId: string) => void;
  /** §42 fix: mapa MAC→nombre para resolver hostname de estaciones. */
  stationNamesByMac: Map<string, string>;
  onToggleExpand: (ip: string) => void;
  onOpenM5Detail: (dev: ScannedDevice) => void;
  onSyncToSaved: (dev: ScannedDevice, savedDev: SavedDevice) => void;
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => Promise<boolean>;
  onOpenAddModal: (dev: ScannedDevice) => void;
  onRefreshStats: (ip: string, stats: AntennaStats) => void;
}

function DeviceTableRowImpl({
  dev, isSaved, isSaving, rowIdx, sshStatus, isExpanded,
  activeConfigCols, selectedNode, savedDevice,
  isSelected, onToggleSelected, stationNamesByMac,
  onToggleExpand, onOpenM5Detail, onSyncToSaved,
  onDirectSave, onOpenAddModal, onRefreshStats,
}: DeviceTableRowProps) {
  const hasStats = !!dev.cachedStats;
  const rawMode = dev.cachedStats?.mode || dev.role;
  const isAp = rawMode === 'ap' || rawMode === 'master';
  const isSta = rawMode === 'sta';
  const devId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
  // §42-2: una fila es "candidato" para bulk save si tiene SSH OK + no está
  // saved + hay nodo destino. Solo entonces se renderiza el checkbox; en otras
  // filas la celda checkbox queda vacía para no engañar al usuario.
  const isCandidate = !isSaved && sshStatus === 'success' && !!selectedNode;
  const freq = dev.cachedStats?.frequency ?? dev.frequency;
  const freqGhz = freq ? (freq / 1000).toFixed(1) : null;
  const displayName = dev.cachedStats?.deviceName ?? (dev.name && dev.name !== dev.ip ? dev.name : null);
  const displayModel = dev.cachedStats?.deviceModel || dev.model;
  const displayMac = dev.cachedStats?.wlanMac || dev.mac;

  // Zebra simplificado — fondo único blanco/slate, el estado del device se
  // comunica con un border-l-2 lateral (indigo=guardado, emerald=hasStats,
  // transparente=neutro). Esto recupera el efecto zebra que rastrea filas en
  // listas largas (que antes se rompía cuando mezclaban 3 paletas).
  //
  // Cuando la fila está EXPANDIDA (panel de stats abierto debajo), el border
  // pasa a 4px sólido indigo-500 — se ve distinto al border-2 normal incluso
  // en la visión periférica del scroll. Permite al usuario rastrear qué
  // fila tiene panel abierto sin tener que volver a ella.
  const stateBorder = isExpanded
    ? 'border-l-4 border-l-indigo-500 dark:border-l-indigo-400'
    : isSaved
      ? 'border-l-2 border-l-indigo-400'
      : hasStats
        ? 'border-l-2 border-l-emerald-400'
        : 'border-l-2 border-l-transparent';
  const stateBg = rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/60 dark:bg-slate-800/40';
  const hoverBg = isSaved
    ? 'hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10'
    : hasStats
      ? 'hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10'
      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60';
  // Versión group-hover del fondo — la usa la celda Acción sticky para que su
  // bg cambie sincronizado con el resto del row durante hover. Sin esto, la
  // celda flotante quedaría con el bg pasivo mientras el resto se ilumina.
  const groupHoverBg = isSaved
    ? 'group-hover:bg-indigo-50/40 dark:group-hover:bg-indigo-500/10'
    : hasStats
      ? 'group-hover:bg-emerald-50/40 dark:group-hover:bg-emerald-500/10'
      : 'group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60';
  const fixedStateBg = rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800';
  const fixedGroupHoverBg = isSaved
    ? 'group-hover:bg-indigo-50 dark:group-hover:bg-slate-800'
    : hasStats
      ? 'group-hover:bg-emerald-50 dark:group-hover:bg-slate-800'
      : 'group-hover:bg-slate-100 dark:group-hover:bg-slate-800';

  return (
    <Fragment>
      {/* `group` permite que la celda Acción sticky-right (U1.A) cambie su
          bg cuando el cursor está sobre el row, sincronizado con el resto. */}
      <div
        role="row"
        style={{ display: 'grid', gridTemplateColumns: 'var(--cols-tpl)' }}
        className={`table-row-auto group items-center border-b border-slate-100 dark:border-slate-800 transition-colors
          ${stateBg} ${hoverBg} ${stateBorder}
          ${isExpanded ? 'border-b-indigo-200 dark:border-b-indigo-500/40' : ''}`}
      >
        {/* §42-2: Checkbox de selección para bulk save. Solo activo en filas
            candidatas (SSH OK + no guardadas + nodo destino). En otras filas
            queda vacío. Stop propagation para no disparar onToggleExpand del row
            por accidente. */}
        <div role="cell" className="flex min-h-11 items-center justify-center">
          {isCandidate && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelected(devId); }}
              role="checkbox"
              aria-checked={isSelected}
              aria-label={isSelected ? `Deseleccionar ${dev.ip} para guardar` : `Seleccionar ${dev.ip} para guardar`}
              title={isSelected ? 'Deseleccionar de la lista a guardar' : 'Seleccionar para guardar'}
              className="group/check flex h-11 w-11 items-center justify-center rounded transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors
                ${isSelected
                  ? 'border-emerald-500 bg-emerald-500 group-hover/check:bg-emerald-600'
                  : 'border-slate-400 group-hover/check:border-emerald-500 dark:border-slate-500'}`}>
                {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </span>
            </button>
          )}
        </div>

        {/* Rol + Frecuencia */}
        <div role="cell" className="px-3 py-2.5">
          {(isAp || isSta) ? (
            <span className={`inline-flex text-2xs font-bold px-1.5 py-0.5 rounded-md
              ${isAp ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400' : 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400'}`}>
              {isAp ? 'AP' : 'CPE'}
            </span>
          ) : rawMode && rawMode !== 'unknown' ? (
            <span className="inline-flex text-2xs font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
              {String(rawMode).toUpperCase()}
            </span>
          ) : (
            <span className="text-2xs text-slate-500 dark:text-slate-500" title="Modo no detectado">—</span>
          )}
          {freqGhz && (
            <p className={`text-2xs font-bold mt-0.5 ${freq! >= 5000 ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {freqGhz}G
            </p>
          )}
        </div>

        {/* IP fija: identidad operativa siempre visible durante scroll horizontal. */}
        <div role="cell" className={`sticky left-0 z-[2] flex min-w-0 items-center px-3 py-3 shadow-[2px_0_6px_-3px_rgba(0,0,0,0.16)] ${fixedStateBg} ${fixedGroupHoverBg}`}>
          <a href={`http://${dev.ip}`} target="_blank" rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            title={`IP: ${dev.ip}${displayMac ? ` · MAC: ${displayMac}` : ''}${displayName ? `\nNombre: ${displayName}` : ''}${displayModel ? ` · Modelo: ${displayModel}` : ''}\nAbrir http://${dev.ip}`}
            className="whitespace-nowrap font-mono text-sm font-semibold text-slate-700 hover:text-sky-600 hover:underline dark:text-slate-200 dark:hover:text-sky-400"
          >{dev.ip}</a>
        </div>

        <div role="cell" className="min-w-0 px-3 py-3 pr-3">
          {displayName && displayName !== dev.ip
            ? <p className="break-words text-sm font-bold leading-5 text-slate-700 dark:text-slate-200" title={displayName}>{displayName}</p>
            : <p className="break-words font-mono text-sm font-semibold leading-5 text-slate-500 dark:text-slate-400" title={dev.ip}>{dev.ip}</p>
          }
          <p className="break-words text-2xs leading-4 text-slate-500 dark:text-slate-400" title={displayModel}>{displayModel || '—'}</p>
        </div>

        {/* Columnas configurables */}
        {activeConfigCols.map(col => (
          <div role="cell" key={col.key} className="px-3 py-3 flex items-center text-sm">
            {col.render(dev)}
          </div>
        ))}

        {/* Toggle expand */}
        <div role="cell" className="flex min-h-11 items-center justify-center">
          {hasStats && (
            <button
              onClick={() => onToggleExpand(dev.ip)}
              title={isExpanded ? 'Ocultar detalle' : 'Ver estadísticas completas'}
              aria-label={isExpanded ? 'Ocultar detalle del dispositivo' : 'Ver estadísticas completas'}
              aria-expanded={isExpanded}
              // §42-3: el chevron pasivo (text-slate-500 dark:text-slate-500) era invisible en
              // modo claro sobre el zebra blanco/slate-50. Subimos a
              // slate-500 + leve bg slate-100 con border slate-200 para
              // que el control destaque sin competir con la celda Acción.
              className={`flex h-11 w-11 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                ${isExpanded
                  ? 'text-indigo-600 bg-indigo-100 border-indigo-200 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40'
                  : 'text-slate-500 bg-slate-100 border-slate-200 hover:text-slate-700 hover:bg-slate-200 hover:border-slate-300 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200'}`}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Action area — sticky-right (U1.A): primario contextual + kebab con
            secundarias (U2). Reduce de 4 botones a 1 + ⋮ → fila ~40% más
            angosta. El primario expone la acción "más usada según contexto"
            (Guardar para nuevos, Ficha para ya guardados). El kebab usa
            createPortal con coords absolutas para evitar el clipping del
            overflow-x-auto de la tabla (regla react-ui-expert). */}
        <div role="cell" className={`px-2 py-3 flex items-center justify-end gap-1 sticky right-0 z-[1] shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)] ${stateBg} ${groupHoverBg}`}>
          <DeviceRowActions
            dev={dev}
            isSaved={isSaved}
            isSaving={isSaving}
            savedDevice={savedDevice}
            selectedNode={selectedNode}
            sshStatus={sshStatus}
            hasStats={hasStats}
            onOpenM5Detail={onOpenM5Detail}
            onSyncToSaved={onSyncToSaved}
            onDirectSave={onDirectSave}
            onOpenAddModal={onOpenAddModal}
          />
        </div>
      </div>

      {isExpanded && (
        <div role="row">
          <div role="cell">
            <DeviceStatusPanel
              dev={dev}
              stationNamesByMac={stationNamesByMac}
              onRefresh={(freshStats) => onRefreshStats(dev.ip, freshStats)}
            />
          </div>
        </div>
      )}
    </Fragment>
  );
}

export const DeviceTableRow = memo(DeviceTableRowImpl, (prev, next) =>
  prev.dev === next.dev &&
  prev.isSaved === next.isSaved &&
  prev.isSaving === next.isSaving &&
  prev.sshStatus === next.sshStatus &&
  prev.isExpanded === next.isExpanded &&
  prev.savedDevice === next.savedDevice &&
  prev.selectedNode === next.selectedNode &&
  prev.activeConfigCols === next.activeConfigCols &&
  prev.rowIdx === next.rowIdx &&
  prev.isSelected === next.isSelected &&
  // stationNamesByMac solo afecta el panel expandido; comparamos referencia.
  (!prev.isExpanded || prev.stationNamesByMac === next.stationNamesByMac)
);

function DeviceMobileRowImpl({
  dev, isSaved, isSaving, rowIdx, sshStatus, isExpanded,
  activeConfigCols, selectedNode, savedDevice,
  isSelected, onToggleSelected, stationNamesByMac,
  onToggleExpand, onOpenM5Detail, onSyncToSaved,
  onDirectSave, onOpenAddModal, onRefreshStats,
}: DeviceTableRowProps) {
  const hasStats = !!dev.cachedStats;
  const rawMode = dev.cachedStats?.mode || dev.role;
  const isAp = rawMode === 'ap' || rawMode === 'master';
  const isSta = rawMode === 'sta';
  const devId = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
  const isCandidate = !isSaved && sshStatus === 'success' && !!selectedNode;
  const freq = dev.cachedStats?.frequency ?? dev.frequency;
  const freqGhz = freq ? (freq / 1000).toFixed(1) : null;
  const displayName = dev.cachedStats?.deviceName ?? (dev.name && dev.name !== dev.ip ? dev.name : null);
  const displayModel = dev.cachedStats?.deviceModel || dev.model;
  const displayMac = dev.cachedStats?.wlanMac || dev.mac;
  const stateBorder = isExpanded
    ? 'border-l-4 border-l-indigo-500 dark:border-l-indigo-400'
    : isSaved
      ? 'border-l-2 border-l-indigo-400'
      : hasStats
        ? 'border-l-2 border-l-emerald-400'
        : 'border-l-2 border-l-transparent';
  const stateBg = rowIdx % 2 === 0
    ? 'bg-white dark:bg-slate-900'
    : 'bg-slate-50/60 dark:bg-slate-800/40';
  const sshLabel = sshStatus === 'pending' ? 'Probando SSH'
    : sshStatus === 'success' ? `SSH conectado${dev.sshUser ? ` · ${dev.sshUser}` : ''}`
      : sshStatus === 'failed' ? 'Sin acceso SSH'
        : 'SSH no probado';

  return (
    <article className={`overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700 ${stateBorder} ${stateBg}`}>
      <div className="p-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {isCandidate && (
            <button
              onClick={() => onToggleSelected(devId)}
              role="checkbox"
              aria-checked={isSelected}
              aria-label={isSelected ? `Deseleccionar ${dev.ip} para guardar` : `Seleccionar ${dev.ip} para guardar`}
              className="group/check flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors
                ${isSelected
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-slate-400 group-hover/check:border-emerald-500 dark:border-slate-500'}`}>
                {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </span>
            </button>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100" title={displayName || dev.ip}>
              {displayName || dev.ip}
            </p>
            <a
              href={`http://${dev.ip}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block font-mono text-xs font-semibold text-sky-700 hover:underline dark:text-sky-400"
            >
              {dev.ip}
            </a>
            <p className="truncate text-2xs text-slate-500 dark:text-slate-400" title={displayModel || undefined}>
              {displayModel || 'Modelo no detectado'}
            </p>
            {displayMac && <p className="truncate font-mono text-2xs text-slate-500 dark:text-slate-400">{displayMac}</p>}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {(isAp || isSta) ? (
              <span className={`rounded-md px-1.5 py-0.5 text-2xs font-bold
                ${isAp ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400' : 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400'}`}>
                {isAp ? 'AP' : 'CPE'}
              </span>
            ) : (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-2xs font-bold text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                {rawMode && rawMode !== 'unknown' ? String(rawMode).toUpperCase() : 'OTRO'}
              </span>
            )}
            {freqGhz && <span className="text-2xs font-bold text-sky-600 dark:text-sky-400">{freqGhz} GHz</span>}
            {isSaved && <span className="text-2xs font-bold text-indigo-600 dark:text-indigo-400">Guardado</span>}
          </div>
        </div>

        {activeConfigCols.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {activeConfigCols.filter(col => col.key !== 'mac').map(col => (
              <div key={col.key} className="min-w-0 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800/60">
                <dt className="truncate text-2xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" title={col.label}>{col.label}</dt>
                <dd className="mt-0.5 min-w-0 overflow-hidden text-sm text-slate-700 dark:text-slate-200">{col.render(dev)}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className={`mr-auto flex min-h-11 items-center gap-1.5 text-2xs font-bold
            ${sshStatus === 'success' ? 'text-emerald-600 dark:text-emerald-400'
              : sshStatus === 'failed' ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500 dark:text-slate-400'}`}>
            {sshStatus === 'pending' && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />}
            {sshStatus === 'success' && <CheckCircle2 className="h-3.5 w-3.5" />}
            {sshStatus === 'failed' && <X className="h-3.5 w-3.5" />}
            <span>{sshLabel}</span>
          </span>

          <DeviceRowActions
            dev={dev}
            isSaved={isSaved}
            isSaving={isSaving}
            savedDevice={savedDevice}
            selectedNode={selectedNode}
            sshStatus={sshStatus}
            hasStats={hasStats}
            onOpenM5Detail={onOpenM5Detail}
            onSyncToSaved={onSyncToSaved}
            onDirectSave={onDirectSave}
            onOpenAddModal={onOpenAddModal}
          />

          {hasStats && (
            <button
              onClick={() => onToggleExpand(dev.ip)}
              title={isExpanded ? 'Ocultar detalle' : 'Ver estadísticas completas'}
              aria-label={isExpanded ? 'Ocultar detalle del dispositivo' : 'Ver estadísticas completas'}
              aria-expanded={isExpanded}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                ${isExpanded
                  ? 'border-indigo-200 bg-indigo-100 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-300'
                  : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <DeviceStatusPanel
          dev={dev}
          stationNamesByMac={stationNamesByMac}
          onRefresh={(freshStats) => onRefreshStats(dev.ip, freshStats)}
        />
      )}
    </article>
  );
}

export const DeviceMobileRow = memo(DeviceMobileRowImpl);

// ────────────────────────────────────────────────────────────────────
//  DeviceRowActions (§41) — botones icon-only inline, sin kebab
//
//  Tras §39 (kebab) la celda llevaba 1 primario + ⋮ con 2-3 secundarias.
//  §41 simplifica: las acciones aplicables se renderizan directamente
//  como botones icono — no hay dropdown ni modal "Ficha". Reglas:
//
//   • !isSaved + selectedNode + sshStatus=success → ✓ Guardar (emerald sólido)
//   • !isSaved + selectedNode (sin SSH ok)        → ➕ Guardar (indigo sólido, abre modal manual)
//   • hasStats                                    → 📈 Informe airOS (violet outline)
//   • isSaved + savedDevice + hasStats            → 🔄 Sincronizar stats (sky outline)
//
//  Resultados típicos:
//   • CPE no guardado con stats:  [✓ Guardar] [📈 Informe airOS]
//   • CPE guardado con stats:     [📈 Informe airOS] [🔄 Sincronizar]
//   • CPE sin stats / sin SSH:    [➕ Guardar]  (o nada si tampoco hay nodo)
//
//  A11y: cada botón icon-only lleva aria-label + title (regla CLAUDE.md).
// ────────────────────────────────────────────────────────────────────

interface DeviceRowActionsProps {
  dev: ScannedDevice;
  isSaved: boolean;
  isSaving: boolean;
  savedDevice: SavedDevice | null;
  selectedNode: NodeInfo | null;
  sshStatus: SshAuthStatus | undefined;
  hasStats: boolean;
  onOpenM5Detail: (dev: ScannedDevice) => void;
  onSyncToSaved: (dev: ScannedDevice, savedDev: SavedDevice) => void;
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => Promise<boolean>;
  onOpenAddModal: (dev: ScannedDevice) => void;
}

type ColorScheme = 'emerald-solid' | 'indigo-solid' | 'violet-outline' | 'sky-outline';

interface RowAction {
  key: string;
  Icon: LucideIcon;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  scheme: ColorScheme;
}

const SCHEME_CLASSES: Record<ColorScheme, string> = {
  'emerald-solid':
    'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20',
  'indigo-solid':
    'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20',
  'violet-outline':
    'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 dark:hover:bg-violet-500/25',
  'sky-outline':
    'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 dark:hover:bg-sky-500/25',
};

function DeviceRowActions({
  dev, isSaved, isSaving, savedDevice, selectedNode, sshStatus, hasStats,
  onOpenM5Detail, onSyncToSaved, onDirectSave, onOpenAddModal,
}: DeviceRowActionsProps) {
  const actions: RowAction[] = [];

  // 1) Guardar — solo si NO está saved y hay nodo destino.
  if (!isSaved && selectedNode) {
    const directSave = sshStatus === 'success' && !!dev.sshUser;
    actions.push({
      key: 'save',
      // El disquete (Save) es metáfora universal de "guardar" — en §42 se
      // sustituyó el Check porque el usuario reportó que confundía con
      // "ya está OK / verificado" en vez de "haz click para guardar".
      Icon: isSaving ? Loader2 : directSave ? Save : PlusCircle,
      onClick: () => directSave
        ? onDirectSave(dev, selectedNode)
        : onOpenAddModal(dev),
      title: isSaving
        ? 'Guardando dispositivo'
        : directSave
        ? 'Guardar con las credenciales SSH ya validadas'
        : 'Guardar — ingresar credenciales SSH manualmente',
      ariaLabel: isSaving ? 'Guardando dispositivo' : 'Guardar dispositivo',
      scheme: directSave ? 'emerald-solid' : 'indigo-solid',
    });
  }

  // 2) Ver informe airOS — siempre que haya stats disponibles.
  if (hasStats) {
    actions.push({
      key: 'info',
      Icon: Sparkles,
      onClick: () => onOpenM5Detail(dev),
      title: 'Abrir diagnóstico inteligente AirOS — datos completos e historial IA',
      ariaLabel: 'Abrir diagnóstico inteligente AirOS',
      scheme: 'violet-outline',
    });
  }

  // 3) Sincronizar stats — solo si ya está guardado y hay stats nuevas.
  if (isSaved && savedDevice && hasStats) {
    actions.push({
      key: 'sync',
      Icon: RefreshCw,
      onClick: () => onSyncToSaved(dev, savedDevice),
      title: 'Sincronizar señal/CCQ/etc en el dispositivo guardado',
      ariaLabel: 'Sincronizar stats',
      scheme: 'sky-outline',
    });
  }

  return (
    <>
      {actions.map(({ key, Icon, onClick, title, ariaLabel, scheme }) => (
        <button
          key={key}
          onClick={onClick}
          disabled={key === 'save' && isSaving}
          title={title}
          aria-label={ariaLabel}
          className={`flex h-11 w-11 items-center justify-center rounded-lg transition-all active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:ring-offset-slate-900 ${SCHEME_CLASSES[scheme]}`}
        >
          <Icon className={`h-3.5 w-3.5 ${key === 'save' && isSaving ? 'motion-safe:animate-spin' : ''}`} />
        </button>
      ))}
    </>
  );
}
