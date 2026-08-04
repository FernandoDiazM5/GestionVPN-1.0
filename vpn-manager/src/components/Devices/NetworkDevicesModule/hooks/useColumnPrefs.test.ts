import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  ACTION_COLUMN_WIDTH,
  DEFAULT_IP_COLUMN_WIDTH,
  MIN_IP_COLUMN_WIDTH,
  useColumnPrefs,
} from './useColumnPrefs';

function useControlledColumnPrefs(initialWidths: Record<string, number> = {}) {
  const [colWidths, setColWidths] = useState(initialWidths);
  const prefs = useColumnPrefs({ visibleCols: ['signal'], colWidths, setColWidths });
  return { ...prefs, colWidths };
}

describe('useColumnPrefs', () => {
  it('reserva el ancho completo de IP y compacta la columna de acciones', () => {
    const { result } = renderHook(() => useControlledColumnPrefs());

    expect(result.current.gridTemplate).toContain(`${DEFAULT_IP_COLUMN_WIDTH}px`);
    expect(result.current.gridTemplate).toContain(`${ACTION_COLUMN_WIDTH}px`);
    expect(result.current.gridTemplate).toContain('minmax(220px,1fr)');
    expect(result.current.gridTemplate).not.toContain('40px');
  });

  it('redimensiona IP y respeta su ancho mínimo legible', () => {
    const { result } = renderHook(() => useControlledColumnPrefs());

    act(() => result.current.startResize('ip', 0, -1000));
    expect(result.current.colWidths.ip).toBe(MIN_IP_COLUMN_WIDTH);

    act(() => result.current.startResize('ip', 0, 40));
    expect(result.current.colWidths.ip).toBe(MIN_IP_COLUMN_WIDTH + 40);
  });
});
