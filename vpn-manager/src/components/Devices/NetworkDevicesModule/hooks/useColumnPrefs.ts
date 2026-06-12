// ============================================================
//  useColumnPrefs — visibilidad + ancho + grid template de columnas
//
//  Persiste `visibleCols` en localStorage (COLS_STORAGE_KEY).
//  Maneja resize drag-drop con un ref para evitar re-renders por mouse-move.
//  Calcula `activeConfigCols` + `gridTemplate` + `minTableWidth` derivados.
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { COLS_STORAGE_KEY, COL_WIDTHS_STORAGE_KEY } from '../constants';
import { COLUMN_DEFS } from '../utils/columns';
import type { ColumnDef } from '../types';

const DEFAULT_VISIBLE = COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key);

function loadColWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Sanity check: solo entries con number positivo
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && v >= 50 && v <= 1000) out[k] = v;
      }
      return out;
    }
  } catch { /* storage corrupto → vacío */ }
  return {};
}

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

  // Resize de columnas — listeners on-demand. Hasta §35 estaban montados a
  // window toda la vida del componente; ahora solo viven entre mousedown del
  // grip y mouseup. Cero overhead cuando nadie está redimensionando.
  // Anchos persistidos en localStorage (sobreviven al recargar la página).
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColWidths);
  const resizingRef = useRef<{ key: string; startX: number; startW: number; onMove: (e: MouseEvent) => void; onUp: () => void } | null>(null);

  // Persiste anchos cada vez que cambian. Throttle natural: solo escribe al
  // commit del state, no a cada mousemove (el setter sí lo hace, pero localStorage
  // es síncrono y bloqueante, así que el effect agrupa el último valor por tick).
  useEffect(() => {
    try {
      if (Object.keys(colWidths).length === 0) {
        localStorage.removeItem(COL_WIDTHS_STORAGE_KEY);
      } else {
        localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(colWidths));
      }
    } catch { /* quota / privacy mode — sin persistencia */ }
  }, [colWidths]);

  // Limpieza defensiva si el componente se desmonta a mitad de un drag.
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
