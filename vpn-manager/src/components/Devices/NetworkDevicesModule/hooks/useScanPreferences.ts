// ============================================================
//  useScanPreferences — preferencias persistentes del módulo Escanear
//
//  Almacén ÚNICO de toda la configuración que el usuario ajusta y
//  espera reencontrar al volver: columnas visibles + orden + anchos,
//  ordenamiento, filtros (rol/SSID/búsqueda) y última subred manual.
//
//  • Una sola clave de localStorage (PREFS_STORAGE_KEY).
//  • Migración silenciosa desde las claves antiguas
//    (vpn_diag_cols_v2 + vpn_diag_col_widths_v1) — ejecutada UNA vez
//    al primer load. Las claves viejas se mantienen para roll-back
//    durante una transición (se podrán borrar más adelante).
//  • Escrituras debounced 300ms para no spamear localStorage en cada
//    keystroke de la búsqueda.
//  • Sanity-check defensivo: si el JSON está corrupto o tiene
//    schemaVersion incompatible, vuelve a los defaults sin romper.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PREFS_STORAGE_KEY,
  PREFS_SCHEMA_VERSION,
  COLS_STORAGE_KEY,
  COL_WIDTHS_STORAGE_KEY,
} from '../constants';
import { COLUMN_DEFS } from '../utils/columns';

export type SortDir = 'asc' | 'desc';
export type RoleFilter = '' | 'ap' | 'sta' | 'unknown';
export interface SortConfig { key: string; dir: SortDir }

export interface ScanPreferences {
  visibleCols: string[];
  colWidths: Record<string, number>;
  sortConfig: SortConfig | null;
  filterRole: RoleFilter;
  filterSSID: string;
  searchQuery: string;
  manualLan: string;
}

const DEFAULT_VISIBLE = COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key);

const DEFAULT_PREFS: ScanPreferences = {
  visibleCols: DEFAULT_VISIBLE,
  colWidths: {},
  sortConfig: { key: 'signal', dir: 'desc' },
  filterRole: '',
  filterSSID: '',
  searchQuery: '',
  manualLan: '',
};

function isValidWidth(v: unknown): v is number {
  return typeof v === 'number' && v >= 50 && v <= 1000;
}

function sanitizeWidths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidWidth(v)) out[k] = v;
  }
  return out;
}

function sanitizeSort(raw: unknown): SortConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SortConfig>;
  if (typeof r.key !== 'string') return null;
  if (r.dir !== 'asc' && r.dir !== 'desc') return null;
  return { key: r.key, dir: r.dir };
}

function sanitizeRole(raw: unknown): RoleFilter {
  return raw === 'ap' || raw === 'sta' || raw === 'unknown' || raw === '' ? raw : '';
}

function sanitizeStr(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

function sanitizeVisibleCols(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  // Mantener solo claves que existen en COLUMN_DEFS, preservando orden.
  const valid = new Set(COLUMN_DEFS.map(c => c.key));
  const filtered = raw.filter((k): k is string => typeof k === 'string' && valid.has(k));
  // Importante: ACEPTAMOS array vacío. El usuario tiene derecho a no mostrar
  // ninguna columna técnica (todavía verá IP/Rol/Acción que son fijas).
  return filtered;
}

/**
 * Migración silenciosa desde las claves antiguas. Se invoca solo si
 * PREFS_STORAGE_KEY no existe. Recupera lo que había en v2 + widths v1
 * para que el usuario no pierda nada al actualizar.
 */
function migrateLegacy(): Partial<ScanPreferences> {
  const out: Partial<ScanPreferences> = {};
  try {
    const cols = localStorage.getItem(COLS_STORAGE_KEY);
    if (cols) {
      const parsed = sanitizeVisibleCols(JSON.parse(cols));
      if (parsed && parsed.length > 0) out.visibleCols = parsed;
    }
  } catch { /* ignore */ }
  try {
    const widths = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
    if (widths) {
      const parsed = sanitizeWidths(JSON.parse(widths));
      if (Object.keys(parsed).length > 0) out.colWidths = parsed;
    }
  } catch { /* ignore */ }
  return out;
}

function loadPrefs(): ScanPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // Schema check — si la versión no coincide, intentamos rescatar campos
      // compatibles. Hoy solo hay v1.
      if (parsed && typeof parsed === 'object') {
        const visibleCols = sanitizeVisibleCols(parsed.visibleCols);
        return {
          ...DEFAULT_PREFS,
          ...(visibleCols !== null ? { visibleCols } : {}),
          colWidths: sanitizeWidths(parsed.colWidths),
          sortConfig: sanitizeSort(parsed.sortConfig) ?? DEFAULT_PREFS.sortConfig,
          filterRole: sanitizeRole(parsed.filterRole),
          filterSSID: sanitizeStr(parsed.filterSSID),
          searchQuery: sanitizeStr(parsed.searchQuery),
          manualLan: sanitizeStr(parsed.manualLan),
        };
      }
    }
  } catch { /* corrupto → migración o default */ }

  // No hay payload v1 → intentar migración legacy y persistir el resultado.
  const legacy = migrateLegacy();
  return { ...DEFAULT_PREFS, ...legacy };
}

function savePrefs(prefs: ScanPreferences): void {
  try {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: PREFS_SCHEMA_VERSION, ...prefs }),
    );
  } catch { /* quota / privacy mode — sin persistencia */ }
}

export interface UseScanPreferencesReturn extends ScanPreferences {
  setVisibleCols: (cols: string[]) => void;
  setColWidths: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  setSortConfig: (updater: (prev: SortConfig | null) => SortConfig | null) => void;
  setFilterRole: (r: RoleFilter) => void;
  setFilterSSID: (s: string) => void;
  setSearchQuery: (s: string) => void;
  setManualLan: (s: string) => void;
  /** Resetea TODAS las preferencias al estado inicial (UI bound a un botón opcional). */
  resetPrefs: () => void;
}

export function useScanPreferences(): UseScanPreferencesReturn {
  const [prefs, setPrefs] = useState<ScanPreferences>(loadPrefs);

  // Debounce — agrupa los cambios consecutivos (sobre todo de search) en un
  // solo write a localStorage. 300ms es suficiente para no perder writes ante
  // navegación rápida pero corta el spam de keystroke.
  const writeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (writeTimerRef.current != null) window.clearTimeout(writeTimerRef.current);
    writeTimerRef.current = window.setTimeout(() => {
      savePrefs(prefs);
      writeTimerRef.current = null;
    }, 300);
    return () => {
      if (writeTimerRef.current != null) {
        window.clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
    };
  }, [prefs]);

  // Flush sincrónico SOLO al desmontar (con la versión más reciente del
  // state vía ref) — para no perder el último cambio si el usuario
  // abandona el módulo antes del debounce. La dep [prefs] sería un bug:
  // el cleanup correría en cada cambio y escribiría sin debounce.
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => () => { savePrefs(prefsRef.current); }, []);

  const setVisibleCols = useCallback((cols: string[]) => {
    setPrefs(p => ({ ...p, visibleCols: cols }));
  }, []);

  const setColWidths = useCallback(
    (updater: (prev: Record<string, number>) => Record<string, number>) => {
      setPrefs(p => ({ ...p, colWidths: updater(p.colWidths) }));
    },
    [],
  );

  const setSortConfig = useCallback(
    (updater: (prev: SortConfig | null) => SortConfig | null) => {
      setPrefs(p => ({ ...p, sortConfig: updater(p.sortConfig) }));
    },
    [],
  );

  const setFilterRole = useCallback((filterRole: RoleFilter) => {
    setPrefs(p => ({ ...p, filterRole }));
  }, []);

  const setFilterSSID = useCallback((filterSSID: string) => {
    setPrefs(p => ({ ...p, filterSSID }));
  }, []);

  const setSearchQuery = useCallback((searchQuery: string) => {
    setPrefs(p => ({ ...p, searchQuery }));
  }, []);

  const setManualLan = useCallback((manualLan: string) => {
    setPrefs(p => ({ ...p, manualLan }));
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefs(DEFAULT_PREFS);
  }, []);

  return {
    ...prefs,
    setVisibleCols,
    setColWidths,
    setSortConfig,
    setFilterRole,
    setFilterSSID,
    setSearchQuery,
    setManualLan,
    resetPrefs,
  };
}
