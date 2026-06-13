// ============================================================
//  useColumnPrefs — cálculo derivado de columnas + resize drag-drop
//
//  Desde §40 la PERSISTENCIA vive en useScanPreferences (un único
//  almacén). Este hook se quedó con la parte puramente derivada:
//    • activeConfigCols (en el orden de visibleCols, no de COLUMN_DEFS).
//    • gridTemplate string para CSS grid.
//    • minTableWidth (suma de anchos para el scroll horizontal).
//    • compactNameMode (T5: oculta "Nombre" cuando hay 6+ cols técnicas).
//    • startResize: registra listeners on-demand de mousemove/up, ajusta
//      el ancho EN VIVO via setColWidths (proveniente del store).
//
//  Visibles + anchos se reciben por argumento; el componente padre
//  decide quién los persiste.
// ============================================================

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { COLUMN_DEFS } from '../utils/columns';
import type { ColumnDef } from '../types';

export interface UseColumnPrefsInput {
  visibleCols: string[];
  colWidths: Record<string, number>;
  setColWidths: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
}

export function useColumnPrefs({ visibleCols, colWidths, setColWidths }: UseColumnPrefsInput) {
  // ── Resize drag-drop ─────────────────────────────────────────────
  // Listeners on-demand: solo viven entre mousedown del grip y mouseup.
  // El último valor de colWidths queda en el store consolidado (debounced).
  const resizingRef = useRef<{ key: string; startX: number; startW: number; onMove: (e: MouseEvent) => void; onUp: () => void } | null>(null);

  // Cleanup defensivo si el componente se desmonta a mitad de drag.
  useEffect(() => () => {
    const r = resizingRef.current;
    if (r) {
      window.removeEventListener('mousemove', r.onMove);
      window.removeEventListener('mouseup', r.onUp);
      resizingRef.current = null;
    }
  }, []);

  const startResize = useCallback((key: string, startX: number) => {
    const currentW = colWidths[key] ?? (parseInt(COLUMN_DEFS.find(c => c.key === key)?.width || '80') || 80);

    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      setColWidths(prev => ({ ...prev, [r.key]: Math.max(50, r.startW + delta) }));
    };
    const onUp = () => {
      const r = resizingRef.current;
      if (!r) return;
      window.removeEventListener('mousemove', r.onMove);
      window.removeEventListener('mouseup', r.onUp);
      resizingRef.current = null;
    };

    resizingRef.current = { key, startX, startW: currentW, onMove, onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths, setColWidths]);

  // ── Derivados puros ──────────────────────────────────────────────
  // Columnas activas (en el orden de visibleCols, no de COLUMN_DEFS)
  const activeConfigCols: ColumnDef[] = useMemo(() =>
    visibleCols
      .map(k => COLUMN_DEFS.find(c => c.key === k))
      .filter(Boolean) as ColumnDef[],
    [visibleCols]
  );

  // Modo lectura (T5): a partir de COMPACT_NAME_THRESHOLD columnas
  // configurables, "Nombre / Modelo" (4ta) se oculta del template para
  // ganar ancho. El nombre sigue en title del IP y en panel expandido.
  const COMPACT_NAME_THRESHOLD = 6;
  const compactNameMode = activeConfigCols.length >= COMPACT_NAME_THRESHOLD;

  // gridTemplateColumns para CSS grid. En compactNameMode se omite la
  // 4ta columna ('minmax(100px,1fr)' = Nombre/Modelo) para alinear filas.
  const gridTemplate = useMemo(() => [
    '40px',
    '54px',
    '140px',
    ...(compactNameMode ? [] : ['minmax(100px,1fr)']),
    ...activeConfigCols.map(c => colWidths[c.key] != null ? `${colWidths[c.key]}px` : c.width),
    '32px',
    '180px',
  ].join(' '), [activeConfigCols, colWidths, compactNameMode]);

  const minTableWidth = useMemo(() => {
    const base = compactNameMode ? [40, 54, 148] : [40, 54, 148, 120];
    return [...base, ...activeConfigCols.map(c => parseInt(c.width.match(/\d+/)?.[0] || '80') || 80), 32, 180]
      .reduce((a, b) => a + b, 0);
  }, [activeConfigCols, compactNameMode]);

  // Quitamos un ancho persistido (acción del header / context menu).
  const clearColWidth = useCallback((key: string) => {
    setColWidths(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [setColWidths]);

  return {
    activeConfigCols,
    compactNameMode,
    gridTemplate,
    minTableWidth,
    startResize,
    clearColWidth,
  };
}
