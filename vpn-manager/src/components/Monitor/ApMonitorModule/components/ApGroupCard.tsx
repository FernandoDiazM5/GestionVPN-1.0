import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, FileText, Loader2, Radio, Wifi, Server, Users, Trash2 } from 'lucide-react';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import ApRow from './ApRow';
import ApColSelector from './selectors/ApColSelector';
import { AP_COL_DEFS, loadApColPrefs, saveApColPrefs } from '../utils/columnDefs';
import { getApStatus, getNodeApStatus } from '../utils/statusHelpers';
import type { NodeGroup } from '../utils/types';

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
  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = sessionStorage.getItem('apMonitor_expanded_' + group.nodeId);
      if (saved !== null) return saved === 'true';
    } catch(e) {}
    return true;
  });
  useEffect(() => {
    sessionStorage.setItem('apMonitor_expanded_' + group.nodeId, String(expanded));
  }, [expanded, group.nodeId]);
  const [hiddenApCols, setHiddenApCols] = useState<Set<string>>(loadApColPrefs);
  const handleApColChange = (h: Set<string>) => { setHiddenApCols(h); saveApColPrefs(h); };

  const apStatuses = group.aps.map(ap => getApStatus(ap, pollResults, activeNodeName, tunnelActive));
  const nodeStatus = getNodeApStatus(apStatuses);
  const statusColor = nodeStatus === 'online' ? 'bg-emerald-500'
    : nodeStatus === 'partial' ? 'bg-amber-400'
      : nodeStatus === 'connecting' ? 'bg-sky-400 animate-pulse'
        : 'bg-slate-300';
  const statusLabel = nodeStatus === 'empty' ? 'Sin APs'
    : nodeStatus === 'online' ? 'Online'
      : nodeStatus === 'partial' ? 'Parcial'
        : nodeStatus === 'connecting' ? 'Conectando…'
          : 'Sin datos';
  const totalCpes = group.aps.reduce((s, ap) => s + (pollResults[ap.id]?.stations.length ?? 0), 0);

  return (
    <div className="card overflow-hidden">
      <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-1 gap-y-2 border-b border-slate-100 bg-slate-50 px-3 py-3.5 sm:flex sm:items-center sm:gap-3 sm:px-5 dark:border-slate-800 dark:bg-slate-800/60">
        <button
          onClick={() => setExpanded(e => !e)}
          aria-label={`${expanded ? 'Contraer' : 'Expandir'} torre ${group.nodeName}`}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-11 items-center justify-center self-start rounded-lg text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 sm:self-auto dark:text-slate-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <Radio className="h-4 w-4 shrink-0 text-indigo-500" />
            <span className="block max-w-full truncate font-bold text-slate-800 dark:text-slate-100" title={group.nodeName}>
              {group.nodeName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:ml-2">
            <span className={`w-2 h-2 rounded-full ${statusColor} ${nodeStatus === 'online' ? 'status-live text-emerald-500' : ''}`} />
            <span className="text-2xs font-bold text-slate-500 dark:text-slate-400">{statusLabel}</span>
          </div>
        </div>
        <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500 sm:ml-auto sm:shrink-0 sm:flex-nowrap dark:text-slate-400">
          <span className="flex shrink-0 items-center gap-1"><Server className="w-3 h-3" /> {group.aps.length} AP{group.aps.length !== 1 ? 's' : ''}</span>
          {group.stas.length > 0 && <span className="flex shrink-0 items-center gap-1 text-cyan-600 dark:text-cyan-400"><Users className="w-3 h-3" /> {group.stas.length} CPE{group.stas.length !== 1 ? 's' : ''}</span>}
          {totalCpes > 0 && <span className="flex shrink-0 items-center gap-1 text-cyan-600 dark:text-cyan-400"><Users className="w-3 h-3" /> {totalCpes} live</span>}
          <button
            type="button"
            onClick={() => onExportReport(group)}
            disabled={reportExporting || group.aps.length === 0}
            title="Generar informe PDF de este nodo"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 text-2xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
          >
            {reportExporting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{reportExporting ? 'Generando…' : 'Informe'}</span>
          </button>
          <ApColSelector hidden={hiddenApCols} onChange={handleApColChange} />
        </div>
      </div>

      {expanded && (
        <>
          {group.aps.length === 0 && group.stas.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3 text-slate-500 dark:text-slate-400">
              <Wifi className="w-8 h-8" />
              <p className="text-sm">No hay APs guardados en este nodo</p>
            </div>
          )}
          {group.aps.length > 0 && (
            <div className="overflow-x-auto">
              {(() => {
                const visibleCols = AP_COL_DEFS.filter(c => c.always || !hiddenApCols.has(c.key));
                const gridCols = visibleCols.map(c => c.width).join(' ');
                const minW = visibleCols.reduce((a, c) => {
                  const m = c.width.match(/(\d+)px/);
                  return a + (m ? parseInt(m[1]) : 120);
                }, 0);
                return (
                  <div style={{ minWidth: `${minW}px` }}>
                    <div className="grid bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-400 uppercase tracking-wider px-4 py-2 dark:bg-slate-800/60 dark:border-slate-800"
                      style={{ gridTemplateColumns: gridCols }}>
                      {visibleCols.map(col => (
                        <span key={col.key} className={`truncate ${col.right ? 'text-right pr-2' : col.key === 'cpes' || col.key === 'estado' ? 'text-center' : col.key === 'actions' ? 'text-right' : ''}`}>
                          {col.label}
                        </span>
                      ))}
                    </div>
                    {group.aps.map(dev => (
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
          )}

          {group.stas.length > 0 && (
            <div className="border-t border-cyan-100 bg-cyan-50/30 dark:border-cyan-500/20 dark:bg-cyan-500/5">
              <div className="px-4 py-2 flex items-center gap-2 border-b border-cyan-100 dark:border-cyan-500/20">
                <span className="text-3xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">CPEs guardados · {group.stas.length}</span>
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
