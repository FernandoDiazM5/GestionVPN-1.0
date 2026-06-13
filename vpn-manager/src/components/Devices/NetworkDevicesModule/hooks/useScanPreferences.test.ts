// ============================================================
//  useScanPreferences — tests de persistencia y migración legacy
//
//  Cubre el contrato §40:
//   • Lee defaults cuando no hay storage.
//   • Persiste cambios (con debounce 300ms).
//   • Migra silenciosamente vpn_diag_cols_v2 + vpn_diag_col_widths_v1
//     a la nueva clave vpn_scan_prefs_v1.
//   • Acepta visibleCols=[] (caso "todas ocultas") sin volver a defaults.
//   • Defiende ante storage corrupto.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useScanPreferences } from './useScanPreferences';
import {
  PREFS_STORAGE_KEY,
  COLS_STORAGE_KEY,
  COL_WIDTHS_STORAGE_KEY,
} from '../constants';

describe('useScanPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca con defaults cuando no hay storage', () => {
    const { result } = renderHook(() => useScanPreferences());
    expect(result.current.sortConfig).toEqual({ key: 'signal', dir: 'desc' });
    expect(result.current.filterRole).toBe('');
    expect(result.current.searchQuery).toBe('');
    expect(result.current.manualLan).toBe('');
    expect(result.current.colWidths).toEqual({});
    expect(result.current.visibleCols.length).toBeGreaterThan(0);
  });

  it('persiste cambios en localStorage tras el debounce', () => {
    const { result } = renderHook(() => useScanPreferences());

    act(() => result.current.setSearchQuery('housenet'));
    act(() => result.current.setFilterRole('ap'));

    // Antes del debounce: nada escrito todavía
    expect(localStorage.getItem(PREFS_STORAGE_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(350);
    });

    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.searchQuery).toBe('housenet');
    expect(parsed.filterRole).toBe('ap');
    expect(parsed.schemaVersion).toBe(1);
  });

  it('rehidrata desde localStorage al montar', () => {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      visibleCols: ['signal', 'ccq'],
      colWidths: { signal: 120 },
      sortConfig: { key: 'ccq', dir: 'asc' },
      filterRole: 'sta',
      filterSSID: 'TORRENET',
      searchQuery: '192.168.10',
      manualLan: '10.0.0.0/24',
    }));

    const { result } = renderHook(() => useScanPreferences());
    expect(result.current.visibleCols).toEqual(['signal', 'ccq']);
    expect(result.current.colWidths).toEqual({ signal: 120 });
    expect(result.current.sortConfig).toEqual({ key: 'ccq', dir: 'asc' });
    expect(result.current.filterRole).toBe('sta');
    expect(result.current.searchQuery).toBe('192.168.10');
    expect(result.current.manualLan).toBe('10.0.0.0/24');
  });

  it('migra silenciosamente las claves legacy v1/v2', () => {
    localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(['signal', 'ccq', 'cpu']));
    localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify({ signal: 120, ccq: 80 }));

    const { result } = renderHook(() => useScanPreferences());
    expect(result.current.visibleCols).toEqual(['signal', 'ccq', 'cpu']);
    expect(result.current.colWidths).toEqual({ signal: 120, ccq: 80 });
  });

  it('acepta visibleCols=[] (todas ocultas) sin volver a defaults', () => {
    const { result } = renderHook(() => useScanPreferences());
    act(() => result.current.setVisibleCols([]));
    act(() => { vi.advanceTimersByTime(350); });

    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.visibleCols).toEqual([]);

    // Re-mount: debe respetar la lista vacía persistida.
    const second = renderHook(() => useScanPreferences());
    expect(second.result.current.visibleCols).toEqual([]);
  });

  it('defiende ante JSON corrupto en storage', () => {
    localStorage.setItem(PREFS_STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useScanPreferences());
    // Debe caer a defaults sin lanzar
    expect(result.current.sortConfig).toEqual({ key: 'signal', dir: 'desc' });
  });

  it('descarta widths fuera del rango sanitizado', () => {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      colWidths: { signal: 120, ccq: -5, cpu: 9999, ram: 'x' },
    }));
    const { result } = renderHook(() => useScanPreferences());
    expect(result.current.colWidths).toEqual({ signal: 120 });
  });

  it('descarta filterRole inválido', () => {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      filterRole: 'BOGUS',
    }));
    const { result } = renderHook(() => useScanPreferences());
    expect(result.current.filterRole).toBe('');
  });
});
