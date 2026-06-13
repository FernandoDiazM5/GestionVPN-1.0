// ============================================================
//  DeviceTableRow — fila individual de la tabla, memoizada
//
//  memo() evita re-renders cuando cambian filas vecinas. Solo
//  re-renderiza si su dev/isSaved/sshStatus/isExpanded cambian.
//  El expand toggle abre <DeviceStatusPanel /> bajo la fila.
// ============================================================

import { memo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2, X, Loader2, ChevronDown, ChevronRight,
  Activity, RefreshCw, Eye, PlusCircle, Check, MoreVertical,
} from 'lucide-react';
import type { ScannedDevice, SavedDevice, AntennaStats } from '../../../../types/devices';
import type { NodeInfo } from '../../../../types/api';
import type { ColumnDef, SshAuthStatus } from '../types';
import { DeviceStatusPanel } from './DeviceStatusPanel';
import { useKebabMenu } from '../../../VPN/NodeCard/hooks/useKebabMenu';

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
  onToggleExpand: (ip: string) => void;
  onOpenM5Detail: (dev: ScannedDevice) => void;
  onSyncToSaved: (dev: ScannedDevice, savedDev: SavedDevice) => void;
  onOpenSavedView: (saved: SavedDevice) => void;
  onOpenScanView: (dev: ScannedDevice) => void;
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => void;
  onOpenAddModal: (dev: ScannedDevice) => void;
  onRefreshStats: (ip: string, stats: AntennaStats) => void;
}

function DeviceTableRowImpl({
  dev, isSaved, rowIdx, sshStatus, isExpanded,
  activeConfigCols, compactNameMode, selectedNode, savedDevice,
  onToggleExpand, onOpenM5Detail, onSyncToSaved,
  onOpenSavedView, onOpenScanView, onDirectSave, onOpenAddModal, onRefreshStats,
}: DeviceTableRowProps) {
  const hasStats = !!dev.cachedStats;
  const rawMode = dev.cachedStats?.mode || dev.role;
  const isAp = rawMode === 'ap' || rawMode === 'master';
  const isSta = rawMode === 'sta';
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
              className={`p-1 rounded-md transition-colors
                ${isExpanded
                  ? 'text-indigo-600 bg-indigo-100 hover:bg-indigo-200'
                  : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
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
            onOpenSavedView={onOpenSavedView}
            onOpenScanView={onOpenScanView}
            onDirectSave={onDirectSave}
            onOpenAddModal={onOpenAddModal}
          />
        </div>
      </div>

      {isExpanded && (
        <DeviceStatusPanel
          dev={dev}
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
  prev.rowIdx === next.rowIdx
);

// ────────────────────────────────────────────────────────────────────
//  DeviceRowActions (U2) — primario contextual + kebab con secundarias
//
//  Reglas de visibilidad:
//   • !isSaved + sshStatus=success + selectedNode  → primario "Guardar" verde
//   • !isSaved + selectedNode (sin SSH ok)         → primario "Guardar" indigo (modal manual)
//   • !isSaved + !selectedNode                     → "Sin nodo" disabled
//   • isSaved                                      → primario "Ficha" indigo
//
//  Kebab con: Informe (siempre si hasStats), Sync (si hasStats+isSaved),
//  Ver datos del scan (si hasStats y NO es la primaria).
//  El menú usa createPortal a document.body + getBoundingClientRect
//  para no quedar atrapado en el overflow-x-auto de la tabla.
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
  onOpenSavedView: (saved: SavedDevice) => void;
  onOpenScanView: (dev: ScannedDevice) => void;
  onDirectSave: (dev: ScannedDevice, node: NodeInfo) => void;
  onOpenAddModal: (dev: ScannedDevice) => void;
}

function DeviceRowActions({
  dev, isSaved, savedDevice, selectedNode, sshStatus, hasStats,
  onOpenM5Detail, onSyncToSaved, onOpenSavedView, onOpenScanView,
  onDirectSave, onOpenAddModal,
}: DeviceRowActionsProps) {
  const { showKebab, setShowKebab, kebabCoords, kebabRef, dropdownRef, handleKebabClick } = useKebabMenu();

  // ── Acciones secundarias del kebab según contexto ───────────────
  interface SecondaryAction {
    icon: React.ReactNode;
    label: string;
    title: string;
    onClick: () => void;
    color: 'violet' | 'sky' | 'indigo';
  }
  const secondaries: SecondaryAction[] = [];
  if (hasStats) {
    secondaries.push({
      icon: <Activity className="w-3.5 h-3.5 text-violet-500 shrink-0" />,
      label: 'Ver informe airOS',
      title: 'Estado completo del dispositivo (mca-status)',
      onClick: () => onOpenM5Detail(dev),
      color: 'violet',
    });
  }
  if (hasStats && isSaved && savedDevice) {
    secondaries.push({
      icon: <RefreshCw className="w-3.5 h-3.5 text-sky-500 shrink-0" />,
      label: 'Sincronizar stats',
      title: 'Refresca señal/CCQ/etc en el dispositivo guardado',
      onClick: () => onSyncToSaved(dev, savedDevice),
      color: 'sky',
    });
  }
  if (hasStats && !isSaved) {
    secondaries.push({
      icon: <Eye className="w-3.5 h-3.5 text-indigo-500 shrink-0" />,
      label: 'Ver datos del scan',
      title: 'Ficha con los datos detectados durante el escaneo',
      onClick: () => onOpenScanView(dev),
      color: 'indigo',
    });
  }

  // ── Botón primario contextual ───────────────────────────────────
  let primary: React.ReactNode = null;
  if (!isSaved && selectedNode) {
    primary = sshStatus === 'success' && dev.sshUser ? (
      <button
        onClick={() => onDirectSave(dev, selectedNode)}
        title="Guardar con las credenciales SSH ya validadas"
        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-[0.97] whitespace-nowrap"
      >
        <Check className="w-3 h-3" />
        <span>Guardar</span>
      </button>
    ) : (
      <button
        onClick={() => onOpenAddModal(dev)}
        title="Guardar dispositivo — ingresar credenciales SSH manualmente"
        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all active:scale-[0.97] whitespace-nowrap"
      >
        <PlusCircle className="w-3 h-3" />
        <span>Guardar</span>
      </button>
    );
  } else if (isSaved && savedDevice) {
    primary = (
      <button
        onClick={() => onOpenSavedView(savedDevice)}
        title="Ver ficha guardada del dispositivo"
        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all whitespace-nowrap dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30 dark:hover:bg-indigo-500/25"
      >
        <Eye className="w-3 h-3" />
        <span>Ficha</span>
      </button>
    );
  } else if (!isSaved && !selectedNode) {
    primary = <span className="text-[10px] text-slate-400 whitespace-nowrap pr-1">Sin nodo</span>;
  }

  const hoverColorMap: Record<SecondaryAction['color'], string> = {
    violet: 'hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/15 dark:hover:text-violet-300',
    sky:    'hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/15 dark:hover:text-sky-300',
    indigo: 'hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300',
  };

  return (
    <>
      {primary}

      {secondaries.length > 0 && (
        <div ref={kebabRef} className="relative">
          <button
            onClick={handleKebabClick}
            title="Más acciones"
            aria-label="Más acciones"
            aria-haspopup="menu"
            aria-expanded={showKebab}
            className={`p-1.5 rounded-lg transition-colors
              ${showKebab
                ? 'text-slate-700 bg-slate-100 dark:text-slate-100 dark:bg-slate-700'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800'}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showKebab && createPortal(
            <div
              ref={dropdownRef}
              role="menu"
              style={kebabCoords}
              className="fixed w-52 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/60 z-[9999] py-1 overflow-hidden dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/40"
            >
              {secondaries.map(a => (
                <button
                  key={a.label}
                  role="menuitem"
                  onClick={() => { a.onClick(); setShowKebab(false); }}
                  title={a.title}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-600 transition-colors text-left dark:text-slate-300 ${hoverColorMap[a.color]}`}
                >
                  {a.icon}
                  <span>{a.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      )}
    </>
  );
}
