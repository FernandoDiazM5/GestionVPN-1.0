import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, FileText, Loader2, Radio, Wifi, Server, Users, Trash2 } from 'lucide-react';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import ApRow from './ApRow';
import ApColSelector from './selectors/ApColSelector';
import { AP_COL_DEFS, loadApColPrefs, saveApColPrefs } from '../utils/columnDefs';
import { getApStatus, getNodeApStatus } from '../utils/statusHelpers';
import type { NodeGroup } from '../utils/types';
import { AP_SORT_KEYS, loadApSort, saveApSort, sortAps, type ApSortConfig, type ApSortKey } from '../utils/apSort';

function ApGroupCard({ group, expandedAps, pollResults, activeNodeName, tunnelActive, reportExporting, onExportReport, onToggleAp, onCpeDetail, onApDetail: _onApDetail, onM5Detail, onApView, onApSync, onApDelete, onApMove, onApRevealSsh }: {
  group: NodeGroup;
  expandedAps: Set<string>;
  pollResults: Record<string, PollResult>;
  activeNodeName: string | null;
  tunnelActive: boolean;
  reportExporting: boolean;
  onExportReport: (group: NodeGroup) => void;
  onToggleAp: (apId: string) => void;
  onCpeDetail: (mac: string, ip: string | null, dev: SavedDevice) => void;
  onApDetail: (dev: SavedDevice) => void;
  onM5Detail: (dev: SavedDevice) => void;
  onApView: (dev: SavedDevice) => void;
  onApSync: (apId: string) => void;
  onApDelete: (dev: SavedDevice) => void;
  onApMove: (dev: SavedDevice) => void;
  onApRevealSsh: (dev: SavedDevice) => void;
}) {
  // Cada entrada a la vista comienza con los sitios compactos. La expansión
  // es una decisión temporal del usuario y no se restaura entre visitas.
  const [expanded, setExpanded] = useState(false);
  const [hiddenApCols, setHiddenApCols] = useState<Set<string>>(loadApColPrefs);
  const [sortConfig, setSortConfig] = useState<ApSortConfig | null>(() => loadApSort(group.nodeId));
  const handleApColChange = (h: Set<string>) => { setHiddenApCols(h); saveApColPrefs(h); };

  const apStatuses = group.aps.map(ap => getApStatus(ap, pollResults, activeNodeName, tunnelActive));
  const apStatusById = useMemo(
    () => Object.fromEntries(group.aps.map(ap => [ap.id, getApStatus(ap, pollResults, activeNodeName, tunnelActive)])),
    [group.aps, pollResults, activeNodeName, tunnelActive],
  );
  const sortedAps = useMemo(
    () => sortAps(group.aps, sortConfig, pollResults, apStatusById),
    [group.aps, sortConfig, pollResults, apStatusById],
  );
  const setAndSaveSort = (next: ApSortConfig | null) => {
    setSortConfig(next);
    saveApSort(group.nodeId, next);
  };
  const cycleSort = (key: ApSortKey) => {
    if (sortConfig?.key !== key) setAndSaveSort({ key, direction: 'asc' });
    else if (sortConfig.direction === 'asc') setAndSaveSort({ key, direction: 'desc' });
    else setAndSaveSort(null);
  };
  const nodeStatus = getNodeApStatus(apStatuses);
  const statusColor = nodeStatus === 'online' ? 'bg-emerald-500'
    : nodeStatus === 'partial' ? 'bg-amber-400'
      : nodeStatus === 'connecting' ? 'bg-sky-400 animate-pulse'
        : 'bg-slate-300';
  const statusLabel = nodeStatus === 'empty' ? 'Sin equipos'
    : nodeStatus === 'online' ? 'En línea'
      : nodeStatus === 'partial' ? 'Requiere atención'
        : nodeStatus === 'connecting' ? 'Actualizando…'
          : 'Sin información';
  const totalCpes = group.aps.reduce((s, ap) => s + (pollResults[ap.id]?.stations.length ?? 0), 0);
  const attentionCount = apStatuses.filter(status => status === 'partial' || status === 'inactive').length;

  return (
    <div className="card overflow-hidden">
      <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-2 border-b border-slate-100 bg-slate-50 px-3 py-3.5 sm:px-5 dark:border-slate-800 dark:bg-slate-800/60">
        <button
          onClick={() => setExpanded(e => !e)}
          aria-label={`${expanded ? 'Contraer' : 'Expandir'} torre ${group.nodeName}`}
          aria-expanded={expanded}
          className="row-span-2 flex min-h-11 min-w-11 items-center justify-center self-start rounded-lg text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <Radio className="h-4 w-4 shrink-0 text-indigo-500" />
            <span className="block min-w-0 truncate text-sm font-bold text-slate-800 sm:text-base dark:text-slate-100" title={group.nodeName}>
              {group.nodeName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor} ${nodeStatus === 'online' ? 'status-live text-emerald-500' : ''}`} />
            <span className="text-2xs font-bold text-slate-500 dark:text-slate-400">{statusLabel}</span>
          </div>
        </div>
        <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex shrink-0 items-center gap-1"><Server className="w-3 h-3" /> {group.aps.length} {group.aps.length === 1 ? 'equipo' : 'equipos'}</span>
          {totalCpes > 0 && <span className="flex shrink-0 items-center gap-1 text-cyan-600 dark:text-cyan-400"><Users className="w-3 h-3" /> {totalCpes} {totalCpes === 1 ? 'cliente conectado' : 'clientes conectados'}</span>}
          {attentionCount > 0 && <span className="flex shrink-0 items-center gap-1 text-amber-700 dark:text-amber-300">{attentionCount} {attentionCount === 1 ? 'requiere atención' : 'requieren atención'}</span>}
          <button
            type="button"
            onClick={() => onExportReport(group)}
            disabled={reportExporting || group.aps.length === 0}
            title="Descargar el informe de este sitio"
            className="btn-outline btn-sm shrink-0"
          >
            {reportExporting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{reportExporting ? 'Generando…' : 'Descargar informe'}</span>
          </button>
          {expanded ? <ApColSelector hidden={hiddenApCols} onChange={handleApColChange} /> : null}
        </div>
      </div>

      {expanded && (
        <>
          {group.aps.length === 0 && group.stas.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3 text-slate-500 dark:text-slate-400">
              <Wifi className="w-8 h-8" />
              <p className="text-sm">No hay equipos guardados en este sitio</p>
            </div>
          )}
          {group.aps.length > 0 && (
            <div>
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2 sm:hidden dark:border-slate-800 dark:bg-slate-800/30">
                <label htmlFor={`ap-sort-${group.nodeId}`} className="sr-only">Ordenar equipos del sitio</label>
                <select
                  id={`ap-sort-${group.nodeId}`}
                  value={sortConfig?.key ?? ''}
                  onChange={event => {
                    const key = event.target.value as ApSortKey | '';
                    setAndSaveSort(key ? { key, direction: 'asc' } : null);
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">Orden original</option>
                  {AP_COL_DEFS.filter(col => AP_SORT_KEYS.has(col.key as ApSortKey)).map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
                </select>
                <button
                  type="button"
                  disabled={!sortConfig}
                  onClick={() => sortConfig && setAndSaveSort({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                  aria-label={sortConfig?.direction === 'desc' ? 'Cambiar a orden ascendente' : 'Cambiar a orden descendente'}
                  className="btn-outline btn-icon min-h-11 min-w-11"
                >
                  {sortConfig?.direction === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                </button>
              </div>
              <div className="overflow-x-auto">
              {(() => {
                const visibleCols = AP_COL_DEFS.filter(c => c.always || !hiddenApCols.has(c.key));
                const gridCols = visibleCols.map(c => c.width).join(' ');
                const minW = visibleCols.reduce((a, c) => {
                  const m = c.width.match(/(\d+)px/);
                  return a + (m ? parseInt(m[1]) : 120);
                }, 0);
                return (
                  <div
                    className="sm:min-w-[var(--ap-table-min-width)]"
                    style={{ '--ap-table-min-width': `${minW}px` } as CSSProperties}
                  >
                    <div className="hidden bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-400 uppercase tracking-wider px-4 py-2 sm:grid dark:bg-slate-800/60 dark:border-slate-800"
                      style={{ gridTemplateColumns: gridCols }}>
                      {visibleCols.map(col => {
                        const sortable = AP_SORT_KEYS.has(col.key as ApSortKey);
                        const active = sortConfig?.key === col.key;
                        const ariaSort = active ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                        return (
                          <div key={col.key} role="columnheader" aria-sort={sortable ? ariaSort : undefined}
                            className={`${col.right ? 'text-right pr-2' : col.key === 'cpes' || col.key === 'estado' ? 'text-center' : col.key === 'actions' ? 'text-right' : ''}`}>
                            {sortable ? (
                              <button type="button" onClick={() => cycleSort(col.key as ApSortKey)}
                                aria-label={`Ordenar por ${col.label}${active ? sortConfig.direction === 'asc' ? ' descendente' : ' en orden original' : ' ascendente'}`}
                                className={`inline-flex min-h-11 w-full items-center gap-1 rounded-lg px-1 uppercase tracking-wider hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300 ${col.right ? 'justify-end' : col.key === 'cpes' || col.key === 'estado' ? 'justify-center' : 'justify-start'}`}>
                                <span className="truncate">{col.label}</span>
                                {active
                                  ? sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0 text-indigo-500" /> : <ArrowDown className="h-3 w-3 shrink-0 text-indigo-500" />
                                  : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" />}
                              </button>
                            ) : <span className="inline-flex min-h-11 items-center">{col.label}</span>}
                          </div>
                        );
                      })}
                    </div>
                    {sortedAps.map(dev => (
                      <ApRow
                        key={dev.id}
                        dev={dev}
                        pollResult={pollResults[dev.id]}
                        expanded={expandedAps.has(dev.id)}
                        hiddenApCols={hiddenApCols}
                        onToggle={() => onToggleAp(dev.id)}
                        onCpeDetail={(mac, ip) => onCpeDetail(mac, ip, dev)}
                        onM5Detail={() => onM5Detail(dev)}
                        onView={() => onApView(dev)}
                        onSync={() => onApSync(dev.id)}
                        onDelete={() => onApDelete(dev)}
                        onMove={() => onApMove(dev)}
                        onRevealSsh={() => onApRevealSsh(dev)}
                      />
                    ))}
                  </div>
                );
              })()}
              </div>
            </div>
          )}

          {group.stas.length > 0 && (
            <div className="border-t border-cyan-100 bg-cyan-50/30 dark:border-cyan-500/20 dark:bg-cyan-500/5">
              <div className="px-4 py-2 flex items-center gap-2 border-b border-cyan-100 dark:border-cyan-500/20">
                <span className="text-3xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">Equipos cliente guardados · {group.stas.length}</span>
              </div>
              {group.stas.map(sta => (
                <div key={sta.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-cyan-100/60 last:border-0 hover:bg-cyan-50 transition-colors text-xs dark:border-cyan-500/10 dark:hover:bg-cyan-500/10">
                  <span className="shrink-0 text-3xs font-bold px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30">CPE</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate min-w-0 max-w-[160px]" title={sta.name || sta.ip}>{sta.name || sta.ip}</span>
                  <span className="font-mono text-2xs text-slate-500 dark:text-slate-400 shrink-0">{sta.ip}</span>
                  {sta.mac && <span className="font-mono text-2xs text-slate-500 dark:text-slate-400 shrink-0 hidden sm:block">{sta.mac}</span>}
                  {sta.model && <span className="text-2xs text-slate-500 truncate shrink-0 hidden md:block">{sta.model}</span>}
                  {sta.nodeName && <span className="text-2xs text-indigo-400 truncate shrink-0 hidden lg:block">{sta.nodeName}</span>}
                  <button onClick={() => onApDelete(sta)} title="Eliminar CPE guardado"
                    className="ml-auto p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors shrink-0 dark:hover:bg-rose-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ApGroupCard;
