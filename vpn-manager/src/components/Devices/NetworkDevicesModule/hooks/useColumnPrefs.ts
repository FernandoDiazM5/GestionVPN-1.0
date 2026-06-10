// ============================================================
//  useColumnPrefs — visibilidad + ancho + grid template de columnas
//
//  Persiste `visibleCols` en localStorage (COLS_STORAGE_KEY).
//  Maneja resize drag-drop con un ref para evitar re-renders por mouse-move.
//  Calcula `activeConfigCols` + `gridTemplate` + `minTableWidth` derivados.
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { COLS_STORAGE_KEY } from '../constants';
import { COLUMN_DEFS } from '../utils/columns';
import type { ColumnDef } from '../types';

const DEFAULT_VISIBLE = COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key);

export function useColumnPrefs() {
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* localStorage corrupto → default */ }
    return DEFAULT_VISIBLE;
  });

  const saveVisibleCols = useCallback((cols: string[]) => {
    setVisibleCols(cols);
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
  }, []);

  // Resize de columnas: ref para no re-render en cada mousemove
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      setColWidths(prev => ({ ...prev, [r.key]: Math.max(50, r.startW + delta) }));
    };
    const onUp = () => { resizingRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startResize = useCallback((key: string, startX: number) => {
    const currentW = colWidths[key] ?? (parseInt(COLUMN_DEFS.find(c => c.key === key)?.width || '80') || 80);
    resizingRef.current = { key, startX, startW: currentW };
  }, [colWidths]);

  // Columnas activas (en el orden de visibleCols, no de COLUMN_DEFS)
  const activeConfigCols: ColumnDef[] = useMemo(() =>
    visibleCols
      .map(k => COLUMN_DEFS.find(c => c.key === k))
      .filter(Boolean) as ColumnDef[],
    [visibleCols]
  );

  // gridTemplateColumns para CSS grid: fixed + dynamic + fixed
  const gridTemplate = useMemo(() => [
    '40px',
    '54px',
    '140px',
    'minmax(100px,1fr)',
    ...activeConfigCols.map(c => colWidths[c.key] != null ? `${colWidths[c.key]}px` : c.width),
    '32px',
    '180px',
  ].join(' '), [activeConfigCols, colWidths]);

  const minTableWidth = useMemo(() =>
    [40, 54, 148, 120, ...activeConfigCols.map(c => parseInt(c.width.match(/\d+/)?.[0] || '80') || 80), 32, 180]
      .reduce((a, b) => a + b, 0),
    [activeConfigCols]
  );

  return {
    visibleCols, saveVisibleCols,
    colWidths,
    activeConfigCols,
    gridTemplate,
    minTableWidth,
    startResize,
  };
}
