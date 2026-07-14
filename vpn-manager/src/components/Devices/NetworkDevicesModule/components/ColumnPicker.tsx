import { createPortal } from 'react-dom';
import { X, ChevronUp, ChevronDown, PlusCircle, SlidersHorizontal } from 'lucide-react';
import type { ColumnPickerProps } from '../types';
import { COLUMN_DEFS } from '../utils/columns';
import { useKebabMenu } from '../../../VPN/NodeCard/hooks/useKebabMenu';

export function ColumnPicker({ visibleCols, onChange }: ColumnPickerProps) {
  // Dropdown vía PORTAL + position:fixed (useKebabMenu) para escapar del
  // `overflow-x-auto` de la tabla y del stacking de la columna sticky-right,
  // que antes lo recortaban/tapaban. Mismo patrón que NodesExportMenu.
  const { showKebab, kebabCoords, kebabRef, dropdownRef, handleKebabClick } = useKebabMenu();

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
    <div ref={kebabRef} className="relative">
      <button
        type="button"
        onClick={handleKebabClick}
        aria-haspopup="menu"
        aria-expanded={showKebab}
        className="flex min-h-11 items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10 dark:border-slate-700"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Columnas</span>
        <span className="bg-indigo-100 text-indigo-600 text-3xs font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center dark:bg-indigo-500/15 dark:text-indigo-400">
          {visibleCols.length}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showKebab ? 'rotate-180' : ''}`} />
      </button>

      {showKebab && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          aria-label="Mostrar/ocultar columnas"
          style={{ position: 'fixed', top: kebabCoords.top, bottom: kebabCoords.bottom, right: kebabCoords.right }}
          className="z-[60] w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-3 dark:bg-slate-800 dark:border-slate-700 dark:shadow-black/40"
        >

          {visibleCols.length > 0 && (
            <>
              <p className="text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Visibles · orden</p>
              <div className="space-y-0.5 mb-2">
                {visibleCols.map((key, idx) => {
                  const col = COLUMN_DEFS.find(c => c.key === key);
                  if (!col) return null;
                  return (
                    <div key={key} className="flex min-h-11 items-center gap-1 px-1 rounded-lg hover:bg-slate-50 group dark:hover:bg-slate-800/60">
                      <div className="flex shrink-0">
                        <button type="button" role="menuitem" aria-label={`Mover ${col.label} hacia arriba`} onClick={() => moveUp(idx)} disabled={idx === 0}
                          className="flex h-11 w-11 items-center justify-center text-slate-500 hover:text-indigo-600 disabled:opacity-20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button type="button" role="menuitem" aria-label={`Mover ${col.label} hacia abajo`} onClick={() => moveDown(idx)} disabled={idx === visibleCols.length - 1}
                          className="flex h-11 w-11 items-center justify-center text-slate-500 dark:text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-xs text-slate-700 flex-1 leading-tight">{col.label}</span>
                      {col.requiresStats && <span className="text-3xs font-bold text-slate-500 dark:text-slate-500 uppercase">SSH</span>}
                      <button type="button" role="menuitem" aria-label={`Ocultar ${col.label}`} onClick={() => remove(key)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 opacity-0 transition-colors hover:text-rose-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 group-hover:opacity-100">
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
              <p className="text-3xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-1.5 mt-2">Ocultas</p>
              <div className="space-y-0.5">
                {hiddenCols.map(col => (
                  <button type="button" role="menuitem" key={col.key} onClick={() => addCol(col.key)}
                    className="min-h-11 w-full flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-indigo-50 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-indigo-500/10">
                    <span className="text-xs text-slate-400 flex-1 group-hover:text-indigo-600 transition-colors">{col.label}</span>
                    {col.requiresStats && <span className="text-3xs font-bold text-slate-300 uppercase">SSH</span>}
                    <PlusCircle className="w-3 h-3 text-slate-200 group-hover:text-indigo-500 transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-2 pt-2 border-t border-slate-100 flex gap-1.5">
            <button type="button" role="menuitem" onClick={() => onChange(COLUMN_DEFS.map(c => c.key))}
              className="min-h-11 flex-1 text-2xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              Todas
            </button>
            <span className="text-slate-200">|</span>
            <button type="button" role="menuitem" onClick={() => onChange(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key))}
              className="min-h-11 flex-1 text-2xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              Resetear
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
