import { useState, useEffect, useRef } from 'react';
import { Columns } from 'lucide-react';
import { AP_COL_DEFS } from '../../utils/columnDefs';

function ApColSelector({ hidden, onChange }: { hidden: Set<string>; onChange: (h: Set<string>) => void; }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-bold
          bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:border-slate-700">
        <Columns className="w-3 h-3" />
        COLS AP
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-48 max-h-72 overflow-y-auto dark:bg-slate-900 dark:border-slate-700 dark:shadow-black/40">
          <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-2">Columnas de APs</p>
          {AP_COL_DEFS.filter(c => !c.always).map(col => (
            <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer group">
              <input type="checkbox" checked={!hidden.has(col.key)} onChange={() => toggle(col.key)}
                className="w-3.5 h-3.5 rounded accent-indigo-600" />
              <span className="text-xs text-slate-700 group-hover:text-indigo-600">{col.label}</span>
            </label>
          ))}
          <button onClick={() => onChange(new Set())}
            className="mt-2 w-full text-2xs text-indigo-600 hover:underline text-center">Mostrar todas</button>
        </div>
      )}
    </div>
  );
}

export default ApColSelector;
