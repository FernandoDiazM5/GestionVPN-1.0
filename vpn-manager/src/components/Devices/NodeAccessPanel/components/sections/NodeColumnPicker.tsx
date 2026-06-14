// ============================================================
//  NodeColumnPicker — selector de columnas opcionales de la tabla Nodos
//
//  Equivalente al ColumnPicker de Escanear (§38). Solo gestiona las
//  columnas OPCIONALES (NODE_COLUMN_DEFS); las fijas (Estado / Nodo /
//  Acciones) están fuera del scope del usuario.
//
//  • Dropdown anclado al botón "Columnas".
//  • Re-orden con flechas ↑↓.
//  • Toggle add/remove.
//  • Cierre al click/touch fuera.
//  • Accesibilidad: aria-haspopup + aria-expanded.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown, PlusCircle, SlidersHorizontal } from 'lucide-react';
import { NODE_COLUMN_DEFS } from '../../utils/nodeColumns';

interface NodeColumnPickerProps {
  visibleCols: string[];
  onChange: (cols: string[]) => void;
}

export function NodeColumnPicker({ visibleCols, onChange }: NodeColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
  const hiddenCols = NODE_COLUMN_DEFS.filter(c => !visibleSet.has(c.key));
  const remove = (key: string) => onChange(visibleCols.filter(k => k !== key));
  const addCol = (key: string) => onChange([...visibleCols, key]);
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...visibleCols]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; onChange(next);
  };
  const moveDown = (idx: number) => {
    if (idx === visibleCols.length - 1) return;
    const next = [...visibleCols]; [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]; onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mostrar/ocultar columnas de la tabla"
        className="flex items-center space-x-1.5 px-3 py-2.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors dark:border-slate-700 dark:hover:bg-indigo-500/10 dark:text-slate-300"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Columnas</span>
        <span className="bg-indigo-100 text-indigo-600 text-3xs font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center dark:bg-indigo-500/20 dark:text-indigo-300">
          {visibleCols.length}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-64 max-h-[70vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-700">

          {visibleCols.length > 0 && (
            <>
              <p className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Visibles · orden</p>
              <div className="space-y-0.5 mb-2">
                {visibleCols.map((key, idx) => {
                  const col = NODE_COLUMN_DEFS.find(c => c.key === key);
                  if (!col) return null;
                  return (
                    <div key={key} className="flex items-center gap-1 py-0.5 px-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 group">
                      <div className="flex flex-col shrink-0">
                        <button onClick={() => moveUp(idx)} disabled={idx === 0}
                          aria-label={`Subir columna ${col.label}`}
                          className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 disabled:opacity-20 transition-colors">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveDown(idx)} disabled={idx === visibleCols.length - 1}
                          aria-label={`Bajar columna ${col.label}`}
                          className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 disabled:opacity-20 transition-colors">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 leading-tight">{col.label}</span>
                      <button onClick={() => remove(key)}
                        aria-label={`Ocultar columna ${col.label}`}
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
              <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
              <p className="text-3xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 mt-2">Ocultas</p>
              <div className="space-y-0.5">
                {hiddenCols.map(col => (
                  <button key={col.key} onClick={() => addCol(col.key)}
                    aria-label={`Mostrar columna ${col.label}`}
                    className="w-full flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/15 text-left group">
                    <span className="text-xs text-slate-400 dark:text-slate-500 flex-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">{col.label}</span>
                    <PlusCircle className="w-3 h-3 text-slate-200 group-hover:text-indigo-500 transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex gap-1.5">
            <button onClick={() => onChange(NODE_COLUMN_DEFS.map(c => c.key))}
              className="flex-1 text-2xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
              Todas
            </button>
            <span className="text-slate-200">|</span>
            <button onClick={() => onChange(NODE_COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key))}
              className="flex-1 text-2xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-600 transition-colors">
              Resetear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
