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
  Activity, RefreshCw, PlusCircle, Save, Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import type { ColumnDef, SshAuthStatus } from '../types';
import { DeviceStatusPanel } from './DeviceStatusPanel';

interface DeviceTableRowProps {
  dev: ScannedDevice;
  isSaved: boolean;
  rowIdx: number;
  sshStatus: SshAuthStatus | undefined;
  isExpanded: boolean;
  activeConfigCols: ColumnDef[];
  /** T5: oculta la celda Nombre/Modelo cuando hay 6+ columnas configurables. */
  compactNameMode: boolean;
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
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => void;
  onOpenAddModal: (dev: ScannedDevice) => void;
  onRefreshStats: (ip: string, stats: AntennaStats) => void;
}

function DeviceTableRowImpl({
  dev, isSaved, rowIdx, sshStatus, isExpanded,
  activeConfigCols, compactNameMode, selectedNode, savedDevice,
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

  return (
    <Fragment>
      {/* `group` permite que la celda Acción sticky-right (U1.A) cambie su
          bg cuando el cursor está sobre el row, sincronizado con el resto. */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'var(--cols-tpl)' }}
        className={`group items-center border-b border-slate-100 dark:border-slate-800 transition-colors
          ${stateBg} ${hoverBg} ${stateBorder}
          ${isExpanded ? 'border-b-indigo-200 dark:border-b-indigo-500/40' : ''}`}
      >
        {/* §42-2: Checkbox de selección para bulk save. Solo activo en filas
            candidatas (SSH OK + no guardadas + nodo destino). En otras filas
            queda vacío. Stop propagation para no disparar onToggleExpand del row
            por accidente. */}
        <div className="px-1 py-2.5 flex items-center justify-center">
          {isCandidate && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelected(devId); }}
              role="checkbox"
              aria-checked={isSelected}
              aria-label={isSelected ? `Deseleccionar ${dev.ip} para guardar` : `Seleccionar ${dev.ip} para guardar`}
              title={isSelected ? 'Deseleccionar de la lista a guardar' : 'Seleccionar para guardar'}
              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all active:scale-90
                ${isSelected
                  ? 'border-emerald-500 bg-emerald-500 hover:bg-emerald-600 hover:border-emerald-600'
                  : 'border-slate-400 hover:border-emerald-500 dark:border-slate-500'}`}
            >
              {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </button>
          )}
        </div>

        {/* SSH status — 4 estados visualmente distintos:
            • pending  → spinner indigo
            • success  → check emerald sólido
            • failed   → X rose (NO slate, que se confundía con "no probado")
            • undef.   → placeholder vacío
        */}
        <div className="px-2 py-2.5 flex items-center justify-center">
          {sshStatus === 'pending' && (
            <div role="status" aria-label="Probando SSH" title="Probando SSH..."
              className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center border border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30">
              <Loader2 className="w-3 h-3 text-indigo-500 motion-safe:animate-spin" />
            </div>
          )}
          {sshStatus === 'success' && (
            <div role="status" aria-label={`SSH exitoso con ${dev.sshUser}`} title={`SSH exitoso: ${dev.sshUser}`}
              className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center border border-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            </div>
          )}
          {sshStatus === 'failed' && (
            <div role="status" aria-label="Sin acceso SSH" title="Sin acceso SSH (autenticación falló)"
              className="w-5 h-5 rounded-md bg-rose-50 flex items-center justify-center border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30">
              <X className="w-3 h-3 text-rose-500 dark:text-rose-400" />
            </div>
          )}
          {!sshStatus && (
            <div aria-label="No probado" title="No se intentó conexión SSH"
              className="w-5 h-5 rounded-md border border-dashed border-slate-200 dark:border-slate-700" />
          )}
        </div>

        {/* Rol + Frecuencia */}
        <div className="px-3 py-2.5">
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
            <span className="text-2xs text-slate-400 dark:text-slate-500" title="Modo no detectado">—</span>
          )}
          {freqGhz && (
            <p className={`text-2xs font-bold mt-0.5 ${freq! >= 5000 ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {freqGhz}G
            </p>
          )}
        </div>

        {/* IP / MAC — en modo compacto enriquecemos el title con nombre+modelo
            porque la columna Nombre/Modelo se oculta a partir de 6 configurables */}
        <div className="px-3 py-3 min-w-0 pr-3">
          <a href={`http://${dev.ip}`} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={compactNameMode && (displayName || displayModel)
              ? `${displayName || dev.ip}${displayModel ? ` · ${displayModel}` : ''}\nAbrir http://${dev.ip}`
              : `Abrir http://${dev.ip}`}
            className="font-mono text-sm font-semibold text-slate-700 hover:text-sky-600 hover:underline truncate block dark:text-slate-200 dark:hover:text-sky-400"
          >{dev.ip}</a>
          {displayMac
            ? <p className="font-mono text-2xs text-slate-500 truncate dark:text-slate-400">{displayMac}</p>
            : <p className="text-2xs text-amber-600 dark:text-amber-400 font-semibold">SSH-only</p>
          }
        </div>

        {/* Nombre / Modelo — oculto en modo compacto (T5) */}
        {!compactNameMode && (
          <div className="px-3 py-3 min-w-0 pr-3">
            {displayName && displayName !== dev.ip
              ? <p className="text-sm font-bold text-slate-700 truncate dark:text-slate-200" title={displayName}>{displayName}</p>
              : <p className="text-sm font-semibold text-slate-500 truncate font-mono dark:text-slate-400" title={dev.ip}>{dev.ip}</p>
            }
            <p className="text-2xs text-slate-500 truncate dark:text-slate-400" title={displayModel}>{displayModel || '—'}</p>
          </div>
        )}

        {/* Columnas configurables */}
        {activeConfigCols.map(col => (
          <div key={col.key} className="px-3 py-3 flex items-center text-sm">
            {col.render(dev)}
          </div>
        ))}

        {/* Toggle expand */}
        <div className="px-1 py-2.5 flex items-center justify-center">
          {hasStats && (
            <button
              onClick={() => onToggleExpand(dev.ip)}
              title={isExpanded ? 'Ocultar detalle' : 'Ver estadísticas completas'}
              aria-label={isExpanded ? 'Ocultar detalle del dispositivo' : 'Ver estadísticas completas'}
              aria-expanded={isExpanded}
              // §42-3: el chevron pasivo (text-slate-400 dark:text-slate-500) era invisible en
              // modo claro sobre el zebra blanco/slate-50. Subimos a
              // slate-500 + leve bg slate-100 con border slate-200 para
              // que el control destaque sin competir con la celda Acción.
              className={`p-1 rounded-md border transition-colors
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
        <div className={`px-2 py-3 flex items-center justify-end gap-1 sticky right-0 z-[1] shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)] ${stateBg} ${groupHoverBg}`}>
          <DeviceRowActions
            dev={dev}
            isSaved={isSaved}
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
        <DeviceStatusPanel
          dev={dev}
          stationNamesByMac={stationNamesByMac}
          onRefresh={(freshStats) => onRefreshStats(dev.ip, freshStats)}
        />
      )}
    </Fragment>
  );
}

export const DeviceTableRow = memo(DeviceTableRowImpl, (prev, next) =>
  prev.dev === next.dev &&
  prev.isSaved === next.isSaved &&
  prev.sshStatus === next.sshStatus &&
  prev.isExpanded === next.isExpanded &&
  prev.savedDevice === next.savedDevice &&
  prev.selectedNode === next.selectedNode &&
  prev.activeConfigCols === next.activeConfigCols &&
  prev.compactNameMode === next.compactNameMode &&
  prev.rowIdx === next.rowIdx &&
  prev.isSelected === next.isSelected &&
  // stationNamesByMac solo afecta el panel expandido; comparamos referencia.
  (!prev.isExpanded || prev.stationNamesByMac === next.stationNamesByMac)
);

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
  savedDevice: SavedDevice | null;
  selectedNode: NodeInfo | null;
  sshStatus: SshAuthStatus | undefined;
  hasStats: boolean;
  onOpenM5Detail: (dev: ScannedDevice) => void;
  onSyncToSaved: (dev: ScannedDevice, savedDev: SavedDevice) => void;
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => void;
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
  dev, isSaved, savedDevice, selectedNode, sshStatus, hasStats,
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
      Icon: directSave ? Save : PlusCircle,
      onClick: () => directSave
        ? onDirectSave(dev, selectedNode)
        : onOpenAddModal(dev),
      title: directSave
        ? 'Guardar con las credenciales SSH ya validadas'
        : 'Guardar — ingresar credenciales SSH manualmente',
      ariaLabel: 'Guardar dispositivo',
      scheme: directSave ? 'emerald-solid' : 'indigo-solid',
    });
  }

  // 2) Ver informe airOS — siempre que haya stats disponibles.
  if (hasStats) {
    actions.push({
      key: 'info',
      Icon: Activity,
      onClick: () => onOpenM5Detail(dev),
      title: 'Ver informe airOS — estado completo del dispositivo (mca-status)',
      ariaLabel: 'Ver informe airOS',
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
          title={title}
          aria-label={ariaLabel}
          className={`p-1.5 rounded-lg transition-all active:scale-[0.95] ${SCHEME_CLASSES[scheme]}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </>
  );
}
