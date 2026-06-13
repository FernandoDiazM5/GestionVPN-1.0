import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Radio, Wifi, Server, Users, Trash2 } from 'lucide-react';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import ApRow from './ApRow';
import ApColSelector from './selectors/ApColSelector';
import { AP_COL_DEFS, loadApColPrefs, saveApColPrefs } from '../utils/columnDefs';
import { getApStatus } from '../utils/statusHelpers';
import type { NodeGroup } from '../utils/types';

function ApGroupCard({ group, expandedAps, pollResults, activeNodeName, tunnelActive, onToggleAp, onCpeDetail, onApDetail: _onApDetail, onM5Detail, onApView, onApSync, onApDelete, onApMove }: {
  group: NodeGroup;
  expandedAps: Set<string>;
  pollResults: Record<string, PollResult>;
  activeNodeName: string | null;
  tunnelActive: boolean;
  onToggleAp: (apId: string) => void;
  onCpeDetail: (mac: string, ip: string | null, dev: SavedDevice) => void;
  onApDetail: (dev: SavedDevice) => void;
  onM5Detail: (dev: SavedDevice) => void;
  onApView: (dev: SavedDevice) => void;
  onApSync: (apId: string) => void;
  onApDelete: (dev: SavedDevice) => void;
  onApMove: (dev: SavedDevice) => void;
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
  const anyOnline = apStatuses.some(s => s === 'online');
  const anyPartial = apStatuses.some(s => s === 'partial');
  const anyConnecting = apStatuses.some(s => s === 'connecting');
  const statusColor = group.aps.length === 0 ? 'bg-slate-300'
    : anyOnline ? 'bg-emerald-500'
      : anyPartial ? 'bg-amber-400'
        : anyConnecting ? 'bg-sky-400 animate-pulse'
          : 'bg-slate-300';
  const statusLabel = group.aps.length === 0 ? 'Sin APs'
    : anyOnline ? 'Online'
      : anyPartial ? 'Parcial'
        : anyConnecting ? 'Conectando…'
          : 'Sin datos';
  const totalCpes = group.aps.reduce((s, ap) => s + (pollResults[ap.id]?.stations.length ?? 0), 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100">
        <button onClick={() => setExpanded(e => !e)}
          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Radio className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="font-bold text-slate-800">{group.nodeName}</span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className={`w-2 h-2 rounded-full ${statusColor} ${anyOnline ? 'status-live text-emerald-500' : ''}`} />
            <span className="text-2xs font-bold text-slate-500 dark:text-slate-400">{statusLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1"><Server className="w-3 h-3" /> {group.aps.length} AP{group.aps.length !== 1 ? 's' : ''}</span>
          {group.stas.length > 0 && <span className="flex items-center gap-1 text-cyan-600"><Users className="w-3 h-3" /> {group.stas.length} CPE{group.stas.length !== 1 ? 's' : ''}</span>}
          {totalCpes > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3 text-violet-500" /> {totalCpes} live</span>}
          <ApColSelector hidden={hiddenApCols} onChange={handleApColChange} />
        </div>
      </div>

      {expanded && (
        <>
          {group.aps.length === 0 && group.stas.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3 text-slate-400">
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
                    <div className="grid bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-wider px-4 py-2"
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
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {group.stas.length > 0 && (
            <div className="border-t border-cyan-100 bg-cyan-50/30">
              <div className="px-4 py-2 flex items-center gap-2 border-b border-cyan-100">
                <span className="text-[9px] font-bold text-cyan-600 uppercase tracking-wider">CPEs guardados · {group.stas.length}</span>
              </div>
              {group.stas.map(sta => (
                <div key={sta.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-cyan-100/60 last:border-0 hover:bg-cyan-50 transition-colors text-xs">
                  <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-700 border border-cyan-200">CPE</span>
                  <span className="font-semibold text-slate-700 truncate min-w-0 max-w-[160px]" title={sta.name || sta.ip}>{sta.name || sta.ip}</span>
                  <span className="font-mono text-2xs text-slate-400 shrink-0">{sta.ip}</span>
                  {sta.mac && <span className="font-mono text-2xs text-slate-400 shrink-0 hidden sm:block">{sta.mac}</span>}
                  {sta.model && <span className="text-2xs text-slate-500 truncate shrink-0 hidden md:block">{sta.model}</span>}
                  {sta.nodeName && <span className="text-2xs text-indigo-400 truncate shrink-0 hidden lg:block">{sta.nodeName}</span>}
                  <button onClick={() => onApDelete(sta)} title="Eliminar CPE guardado"
                    className="ml-auto p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
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
