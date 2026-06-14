import { useState, useMemo } from 'react';
import { Loader2, X, Search, ScanSearch, ZapOff, AlertTriangle } from 'lucide-react';
import type { SavedDevice } from '../../../../types/devices';
import type { PollResult } from '../../../../types/apMonitor';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';
import { API_BASE_URL } from '../../../../config';
import CpeRow from './CpeRow';
import ColSelector from './selectors/ColSelector';
import { CPE_COL_DEFS, loadColPrefs, saveColPrefs } from '../utils/columnDefs';
import { cpeHealth, degradedSummary } from '../utils/health';

const BASE = `${API_BASE_URL}/api/ap-monitor`;

function StationTable({ poll, onCpeDetail, dev }: {
  poll: PollResult;
  onCpeDetail: (mac: string, ip: string | null) => void;
  dev: SavedDevice;
}) {
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadColPrefs);
  const [cpeSearch, setCpeSearch] = useState('');
  const [onlyDegraded, setOnlyDegraded] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState('');

  const handleColChange = (h: Set<string>) => { setHiddenCols(h); saveColPrefs(h); };

  // E3: resumen de CPEs degradados (señal/CCQ bajo umbral).
  const degraded = useMemo(() => degradedSummary(poll.stations), [poll.stations]);

  const filtered = useMemo(() => {
    let list = poll.stations;
    if (onlyDegraded) list = list.filter(s => cpeHealth(s) !== 'ok');
    if (cpeSearch.trim()) {
      const q = cpeSearch.toLowerCase();
      list = list.filter(s =>
        s.mac.toLowerCase().includes(q) ||
        (s.hostname ?? '').toLowerCase().includes(q) ||
        (s.remote_hostname ?? '').toLowerCase().includes(q) ||
        (s.cpe_name ?? '').toLowerCase().includes(q) ||
        (s.cpe_product ?? '').toLowerCase().includes(q) ||
        (s.modelo ?? '').toLowerCase().includes(q) ||
        (s.lastip ?? '').includes(q)
      );
    }
    return list;
  }, [poll.stations, cpeSearch, onlyDegraded]);

  const needEnrich = poll.stations.filter(s =>
    s.lastip && !s.isKnown && !s.remote_hostname && !s.cpe_name
  );

  const handleEnrichAll = async () => {
    if (!dev.sshUser || (!dev.sshPass && !dev.hasSshPass) || needEnrich.length === 0) return;
    setEnriching(true); setEnrichMsg('');
    try {
      const r = await fetchWithTimeout(`${BASE}/cpes/enrich-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // C4: credenciales SSH resueltas server-side desde la DB; no se envían desde el navegador.
        body: JSON.stringify({
          cpes: needEnrich.map(s => ({ mac: s.mac, ip: s.lastip })),
          apId: dev.id,
          port: dev.sshPort ?? 22,
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
    <div className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {poll.loading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
          <span className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Station List · {poll.stations.length} CPE{poll.stations.length !== 1 ? 's' : ''}
          </span>
          {degraded.count > 0 && (
            <span title={`${degraded.count} CPE(s) con señal o CCQ bajo umbral`}
              className={`inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-md
                ${degraded.hasCritical
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'}`}>
              <AlertTriangle className="w-2.5 h-2.5" />
              {degraded.count} degradado{degraded.count !== 1 ? 's' : ''}
            </span>
          )}
          {poll.error && <span className="text-3xs text-rose-500 font-medium">{poll.error}</span>}
          {enrichMsg && <span className="text-3xs text-emerald-600 font-medium">{enrichMsg}</span>}
        </div>
        <div className="flex items-center gap-2">
          {degraded.count > 0 && (
            <button onClick={() => setOnlyDegraded(v => !v)}
              title="Mostrar solo CPEs degradados (señal/CCQ bajo umbral)"
              aria-pressed={onlyDegraded}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-bold border transition-colors
                ${onlyDegraded
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
              <AlertTriangle className="w-3 h-3" />
              Solo degradados
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 dark:text-slate-400" />
            <input
              value={cpeSearch} onChange={e => setCpeSearch(e.target.value)}
              placeholder="Buscar CPE…"
              className="pl-6 pr-2 py-1 text-2xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 w-36 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
            />
            {cpeSearch && <button onClick={() => setCpeSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>}
          </div>
          {needEnrich.length > 0 && (
            <button onClick={handleEnrichAll} disabled={enriching}
              title={`SSH a ${needEnrich.length} CPE(s) para obtener nombre/modelo`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-bold
                bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200 transition-colors disabled:opacity-50 dark:bg-cyan-500/10 dark:text-cyan-400 dark:hover:bg-cyan-500/20 dark:border-cyan-500/30">
              {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
              {enriching ? 'Enriching…' : `Enrich ${needEnrich.length}`}
            </button>
          )}
          <ColSelector hidden={hiddenCols} onChange={handleColChange} />
          {poll.polledAt > 0 && (
            <span className="text-3xs text-slate-400 dark:text-slate-500 font-mono">
              {new Date(poll.polledAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {poll.stations.length === 0 && !poll.loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-500 dark:text-slate-400">
          <ZapOff className="w-4 h-4" />
          <span className="text-xs">{poll.error ? 'Error en poll SSH' : 'Sin CPEs conectados'}</span>
        </div>
      )}

      {poll.stations.length > 0 && (
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${minW}px` }}>
            <div className="grid bg-slate-100 border-b border-slate-200 text-2xs font-bold text-slate-500 uppercase tracking-wider dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
              style={{ gridTemplateColumns: gridCols }}>
              {visibleColDefs.map(col => (
                <div key={col.key} className={`px-2 py-2.5 ${col.right ? 'text-right' : ''}`}>{col.label}</div>
              ))}
            </div>
            {filtered.map((cpe, idx) => (
              <CpeRow key={cpe.mac} cpe={cpe} idx={idx} onDetail={onCpeDetail} hiddenCols={hiddenCols} gridCols={gridCols} />
            ))}
            {filtered.length === 0 && (cpeSearch || onlyDegraded) && (
              <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400">
                {cpeSearch ? `Sin resultados para "${cpeSearch}"` : 'Sin CPEs degradados'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StationTable;
