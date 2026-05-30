import { useState, useMemo } from 'react';
import { Loader2, X, Search, ScanSearch, ZapOff } from 'lucide-react';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import CpeRow from './CpeRow';
import ColSelector from './selectors/ColSelector';
import { CPE_COL_DEFS, loadColPrefs, saveColPrefs } from '../utils/columnDefs';

const BASE = `${API_BASE_URL}/api/ap-monitor`;

function StationTable({ poll, onCpeDetail, dev }: {
  poll: PollResult;
  onCpeDetail: (mac: string, ip: string | null) => void;
  dev: SavedDevice;
}) {
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadColPrefs);
  const [cpeSearch, setCpeSearch] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');

  const handleColChange = (h: Set<string>) => { setHiddenCols(h); saveColPrefs(h); };

  const filtered = useMemo(() => {
    if (!cpeSearch.trim()) return poll.stations;
    const q = cpeSearch.toLowerCase();
    return poll.stations.filter(s =>
      s.mac.toLowerCase().includes(q) ||
      (s.hostname ?? '').toLowerCase().includes(q) ||
      (s.remote_hostname ?? '').toLowerCase().includes(q) ||
      (s.cpe_name ?? '').toLowerCase().includes(q) ||
      (s.cpe_product ?? '').toLowerCase().includes(q) ||
      (s.modelo ?? '').toLowerCase().includes(q) ||
      (s.lastip ?? '').includes(q)
    );
  }, [poll.stations, cpeSearch]);

  const needEnrich = poll.stations.filter(s =>
    s.lastip && !s.isKnown && !s.remote_hostname && !s.cpe_name
  );

  const handleEnrichAll = async () => {
    if (!dev.sshUser || (!dev.sshPass && !dev.hasSshPass) || needEnrich.length === 0) return;
    setEnriching(true); setEnrichMsg('');
    try {
      const r = await fetchWithTimeout(`${BASE}/cpes/enrich-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpes: needEnrich.map(s => ({ mac: s.mac, ip: s.lastip })),
          apId: dev.id,
          port: dev.sshPort ?? 22,
          user: dev.sshUser,
          pass: dev.sshPass ?? '',
        }),
      }, 120_000);
      const d = await r.json();
      const ok = d.results?.filter((x: { ok: boolean }) => x.ok).length ?? 0;
      setEnrichMsg(`${ok}/${needEnrich.length} CPEs enriquecidos`);
      setTimeout(() => setEnrichMsg(''), 5000);
    } catch (e) {
      setEnrichMsg(e instanceof Error ? e.message : 'Error');
      setTimeout(() => setEnrichMsg(''), 5000);
    }
    setEnriching(false);
  };

  const visibleColDefs = useMemo(
    () => CPE_COL_DEFS.filter(c => c.always || !hiddenCols.has(c.key)),
    [hiddenCols]
  );
  const gridCols = useMemo(() => visibleColDefs.map(c => c.width).join(' '), [visibleColDefs]);
  const minW = useMemo(
    () => visibleColDefs.reduce((a, c) => { const px = parseInt(c.width); return a + (isNaN(px) ? 100 : px); }, 0),
    [visibleColDefs]
  );

  return (
    <div className="border-t border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-slate-50/20">
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          {poll.loading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Station List · {poll.stations.length} CPE{poll.stations.length !== 1 ? 's' : ''}
          </span>
          {poll.error && <span className="text-[9px] text-rose-500 font-medium">{poll.error}</span>}
          {enrichMsg && <span className="text-[9px] text-emerald-600 font-medium">{enrichMsg}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input
              value={cpeSearch} onChange={e => setCpeSearch(e.target.value)}
              placeholder="Buscar CPE…"
              className="pl-6 pr-2 py-1 text-[11px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 w-36"
            />
            {cpeSearch && <button onClick={() => setCpeSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>}
          </div>
          {needEnrich.length > 0 && (
            <button onClick={handleEnrichAll} disabled={enriching}
              title={`SSH a ${needEnrich.length} CPE(s) para obtener nombre/modelo`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold
                bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-colors disabled:opacity-50">
              {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
              {enriching ? 'Enriching…' : `Enrich ${needEnrich.length}`}
            </button>
          )}
          <ColSelector hidden={hiddenCols} onChange={handleColChange} />
          {poll.polledAt > 0 && (
            <span className="text-[9px] text-slate-300 font-mono">
              {new Date(poll.polledAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {poll.stations.length === 0 && !poll.loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
          <ZapOff className="w-4 h-4" />
          <span className="text-xs">{poll.error ? 'Error en poll SSH' : 'Sin CPEs conectados'}</span>
        </div>
      )}

      {poll.stations.length > 0 && (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${minW}px` }}>
            <div className="grid bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider"
              style={{ gridTemplateColumns: gridCols }}>
              {visibleColDefs.map(col => (
                <div key={col.key} className={`px-2 py-2.5 ${col.right ? 'text-right' : ''}`}>{col.label}</div>
              ))}
            </div>
            {filtered.map((cpe, idx) => (
              <CpeRow key={cpe.mac} cpe={cpe} idx={idx} onDetail={onCpeDetail} hiddenCols={hiddenCols} gridCols={gridCols} />
            ))}
            {filtered.length === 0 && cpeSearch && (
              <div className="text-center py-4 text-xs text-slate-400">Sin resultados para "{cpeSearch}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StationTable;
