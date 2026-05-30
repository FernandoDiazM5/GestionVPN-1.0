import { useState, useEffect, useRef } from 'react';
import { Columns } from 'lucide-react';

const LS_KEY = 'ap_monitor_cpe_cols';

interface ColDef { key: string; label: string; always?: boolean; width: string; right?: boolean; }
const CPE_COL_DEFS: ColDef[] = [
  { key: 'status', label: 'Estado', always: true, width: '28px' },
  { key: 'mac', label: 'MAC / Host', always: true, width: '150px' },
  { key: 'modelo', label: 'Modelo', width: '120px' },
  { key: 'nombre', label: 'Nombre Disp.', width: '140px' },
  { key: 'signal', label: 'Señal AP', width: '72px', right: true },
  { key: 'rssi', label: 'Señal CPE', width: '72px', right: true },
  { key: 'noise', label: 'Noise', width: '72px', right: true },
  { key: 'cinr', label: 'CINR', width: '64px', right: true },
  { key: 'ccq', label: 'CCQ', width: '64px', right: true },
  { key: 'tx_rate', label: '↓ TX Rate', width: '80px', right: true },
  { key: 'rx_rate', label: '↑ RX Rate', width: '80px', right: true },
  { key: 'am_qual', label: 'AM Qual', width: '66px', right: true },
  { key: 'am_cap', label: 'AM Cap', width: '66px', right: true },
  { key: 'am_dcap', label: 'DL Cap', width: '72px', right: true },
  { key: 'am_ucap', label: 'UL Cap', width: '72px', right: true },
  { key: 'air_tx', label: 'Air TX %', width: '62px', right: true },
  { key: 'air_rx', label: 'Air RX %', width: '62px', right: true },
  { key: 'thr_rx', label: 'Thr ↓', width: '80px', right: true },
  { key: 'thr_tx', label: 'Thr ↑', width: '80px', right: true },
  { key: 'uptime', label: 'Uptime', width: '100px' },
  { key: 'distance', label: 'Dist (m)', width: '66px', right: true },
  { key: 'lastip', label: 'Última IP', width: '108px' },
  { key: 'actions', label: 'Acciones', always: true, width: '72px' },
];
const DEFAULT_HIDDEN = new Set<string>(['noise', 'cinr', 'am_qual', 'am_cap', 'am_dcap', 'am_ucap', 'air_tx', 'air_rx', 'thr_rx', 'thr_tx']);

function loadColPrefs(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* */ }
  return DEFAULT_HIDDEN;
}
function saveColPrefs(hidden: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...hidden])); } catch { /* */ }
}

function ColSelector({ hidden, onChange }: {
  hidden: Set<string>;
  onChange: (h: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggleCol = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold
          bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors">
        <Columns className="w-3.5 h-3.5" />
        COLUMNAS
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56 max-h-80 overflow-y-auto">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Seleccionar columnas</p>
          {CPE_COL_DEFS.filter(c => !c.always).map(col => (
            <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer group">
              <input type="checkbox" checked={!hidden.has(col.key)} onChange={() => toggleCol(col.key)}
                className="w-3.5 h-3.5 rounded accent-indigo-600" />
              <span className="text-xs text-slate-700 group-hover:text-indigo-600">{col.label}</span>
            </label>
          ))}
          <button onClick={() => onChange(new Set())}
            className="mt-2 w-full text-[10px] text-indigo-600 hover:underline text-center">
            Mostrar todas
          </button>
        </div>
      )}
    </div>
  );
}

export default ColSelector;
export { loadColPrefs, saveColPrefs, CPE_COL_DEFS, DEFAULT_HIDDEN };
