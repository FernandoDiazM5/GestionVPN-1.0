import { useState, useEffect, useRef } from 'react';
import { Columns } from 'lucide-react';
import {
  CPE_COL_DEFS,
  DEFAULT_HIDDEN,
  loadColPrefs,
  saveColPrefs,
} from '../../utils/columnDefs';

function ColSelector({ hidden, unavailable, onChange }: {
  hidden: Set<string>;
  unavailable: Set<string>;
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-bold
          bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:border-slate-700">
        <Columns className="w-3.5 h-3.5" />
        COLUMNAS
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-64 max-h-80 overflow-y-auto dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/40">
          <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-2">Seleccionar columnas</p>
          {CPE_COL_DEFS.filter(c => !c.always).map(col => {
            const isUnavailable = unavailable.has(col.key);
            return (
              <label
                key={col.key}
                title={isUnavailable ? 'Este equipo no entrega esta métrica' : undefined}
                className={`flex items-start gap-2 py-1 ${isUnavailable ? 'cursor-not-allowed opacity-60' : 'cursor-pointer group'}`}
              >
                <input
                  type="checkbox"
                  checked={!isUnavailable && !hidden.has(col.key)}
                  disabled={isUnavailable}
                  onChange={() => toggleCol(col.key)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-indigo-600"
                />
                <span className={`text-xs ${isUnavailable ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 group-hover:text-indigo-600 dark:text-slate-200'}`}>
                  <span className="block">{col.label}</span>
                  {isUnavailable && <span className="block text-3xs font-normal">Sin datos en este equipo</span>}
                </span>
              </label>
            );
          })}
          <button onClick={() => onChange(new Set())}
            className="mt-2 w-full text-2xs text-indigo-600 hover:underline text-center">
            Mostrar todas
          </button>
        </div>
      )}
    </div>
  );
}

export default ColSelector;
export { loadColPrefs, saveColPrefs, CPE_COL_DEFS, DEFAULT_HIDDEN };
