// ============================================================
//  useColumnPrefs — cálculo derivado de columnas + resize drag-drop
//
//  Desde §40 la PERSISTENCIA vive en useScanPreferences (un único
//  almacén). Este hook se quedó con la parte puramente derivada:
//    • activeConfigCols (en el orden de visibleCols, no de COLUMN_DEFS).
//    • gridTemplate string para CSS grid.
//    • minTableWidth (suma de anchos para el scroll horizontal).
//    • startResize: registra listeners on-demand de mousemove/up, ajusta
//      el ancho EN VIVO via setColWidths (proveniente del store).
//
//  Visibles + anchos se reciben por argumento; el componente padre
//  decide quién los persiste.
// ============================================================

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { COLUMN_DEFS } from '../utils/columns';
import type { ColumnDef } from '../types';

export const DEFAULT_IP_COLUMN_WIDTH = 180;
export const MIN_IP_COLUMN_WIDTH = 160;
export const ACTION_COLUMN_WIDTH = 116;

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

  const startResize = useCallback((key: string, startX: number, keyboardDelta?: number) => {
    const defaultWidth = key === 'ip'
      ? DEFAULT_IP_COLUMN_WIDTH
      : (parseInt(COLUMN_DEFS.find(c => c.key === key)?.width || '80') || 80);
    const minimumWidth = key === 'ip' ? MIN_IP_COLUMN_WIDTH : 50;
    const currentW = colWidths[key] ?? defaultWidth;

    if (keyboardDelta != null) {
      setColWidths(prev => ({ ...prev, [key]: Math.max(minimumWidth, currentW + keyboardDelta) }));
      return;
    }

    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      const minWidth = r.key === 'ip' ? MIN_IP_COLUMN_WIDTH : 50;
      setColWidths(prev => ({ ...prev, [r.key]: Math.max(minWidth, r.startW + delta) }));
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

  const ipColumnWidth = colWidths.ip ?? DEFAULT_IP_COLUMN_WIDTH;

  // gridTemplateColumns para CSS grid. La 1ra columna (36px) es el checkbox
  // de selección (§42-2). Nombre/Modelo conserva el mismo ancho flexible
  // base que SSID/AP y nunca se oculta por cantidad de columnas.
  const gridTemplate = useMemo(() => [
    '44px',       // checkbox selección (bulk save)
    '54px',       // Rol + Freq
    `${ipColumnWidth}px`, // IP
    'minmax(220px,1fr)', // Nombre / Modelo
    ...activeConfigCols.map(c => colWidths[c.key] != null ? `${colWidths[c.key]}px` : c.width),
    '44px',       // Toggle expand
    `${ACTION_COLUMN_WIDTH}px`, // Acción
  ].join(' '), [activeConfigCols, colWidths, ipColumnWidth]);

  const minTableWidth = useMemo(() => {
    const base = [44, 54, ipColumnWidth, 220];
    return [...base, ...activeConfigCols.map(c => colWidths[c.key] ?? (parseInt(c.width.match(/\d+/)?.[0] || '80') || 80)), 44, ACTION_COLUMN_WIDTH]
      .reduce((a, b) => a + b, 0);
  }, [activeConfigCols, colWidths, ipColumnWidth]);

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
    gridTemplate,
    minTableWidth,
    startResize,
    clearColWidth,
  };
}
