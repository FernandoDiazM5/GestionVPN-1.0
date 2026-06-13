import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown, PlusCircle, SlidersHorizontal } from 'lucide-react';
import type { ColumnPickerProps } from '../types';
import { COLUMN_DEFS } from '../utils/columns';

export function ColumnPicker({ visibleCols, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierre al click/touch fuera del dropdown. Solo escucha eventos si el
  // dropdown está abierto — evita event dispatch innecesario cuando está
  // cerrado (que es 99% del tiempo). Incluye touchstart para móvil/tablet.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const visibleSet = new Set(visibleCols);
  const hiddenCols = COLUMN_DEFS.filter(c => !visibleSet.has(c.key));
  const remove = (key: string) => onChange(visibleCols.filter(k => k !== key));
  const addCol = (key: string) => onChange([...visibleCols, key]);
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...visibleCols];[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; onChange(next);
  };
  const moveDown = (idx: number) => {
    if (idx === visibleCols.length - 1) return;
    const next = [...visibleCols];[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]; onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Columnas</span>
        <span className="bg-indigo-100 text-indigo-600 text-[9px] font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center">
          {visibleCols.length}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-60 max-h-[70vh] overflow-y-auto">

          {visibleCols.length > 0 && (
            <>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Visibles · orden</p>
              <div className="space-y-0.5 mb-2">
                {visibleCols.map((key, idx) => {
                  const col = COLUMN_DEFS.find(c => c.key === key);
                  if (!col) return null;
                  return (
                    <div key={key} className="flex items-center gap-1 py-0.5 px-1 rounded-lg hover:bg-slate-50 group">
                      <div className="flex flex-col shrink-0">
                        <button onClick={() => moveUp(idx)} disabled={idx === 0}
                          className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-20 transition-colors">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveDown(idx)} disabled={idx === visibleCols.length - 1}
                          className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-20 transition-colors">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-xs text-slate-700 flex-1 leading-tight">{col.label}</span>
                      {col.requiresStats && <span className="text-[8px] font-bold text-slate-300 uppercase">SSH</span>}
                      <button onClick={() => remove(key)}
                        className="p-0.5 text-slate-200 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {hiddenCols.length > 0 && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 mt-2">Ocultas</p>
              <div className="space-y-0.5">
                {hiddenCols.map(col => (
                  <button key={col.key} onClick={() => addCol(col.key)}
                    className="w-full flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-indigo-50 text-left group">
                    <span className="text-xs text-slate-400 flex-1 group-hover:text-indigo-600 transition-colors">{col.label}</span>
                    {col.requiresStats && <span className="text-[8px] font-bold text-slate-300 uppercase">SSH</span>}
                    <PlusCircle className="w-3 h-3 text-slate-200 group-hover:text-indigo-500 transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-2 pt-2 border-t border-slate-100 flex gap-1.5">
            <button onClick={() => onChange(COLUMN_DEFS.map(c => c.key))}
              className="flex-1 text-2xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
              Todas
            </button>
            <span className="text-slate-200">|</span>
            <button onClick={() => onChange(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key))}
              className="flex-1 text-2xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
              Resetear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
