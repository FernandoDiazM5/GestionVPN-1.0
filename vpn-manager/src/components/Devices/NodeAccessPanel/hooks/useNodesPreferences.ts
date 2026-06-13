// ============================================================
//  useNodesPreferences — preferencias persistentes del módulo Nodos
//
//  Equivalente a useScanPreferences (§40) pero para la tabla de Nodos.
//  Almacén único para todo lo que el usuario ajusta y espera reencontrar:
//   • visibleCols: qué columnas opcionales mostrar.
//   • sortKey + sortDir: orden actual.
//   • searchQuery: búsqueda libre.
//   • filterProtocol: 'sstp' | 'wireguard' | '' (todos).
//   • filterStatus: 'connected' | 'disconnected' | '' (todos).
//
//  • Una sola clave (PREFS_STORAGE_KEY).
//  • Debounce 300ms (no spamea localStorage en cada keystroke de search).
//  • Flush sincrónico al desmontar vía ref (no perder el último cambio).
//  • Sanity-check defensivo si el storage está corrupto.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

export type NodeSortKey = 'default' | 'nombre_nodo' | 'nombre_vrf' | 'ip_tunnel' | 'running';
export type SortDir = 'asc' | 'desc';
export type ProtocolFilter = '' | 'sstp' | 'wireguard';
export type StatusFilter = '' | 'connected' | 'disconnected';

export interface NodesPreferences {
  visibleCols: string[];
  sortKey: NodeSortKey;
  sortDir: SortDir;
  searchQuery: string;
  filterProtocol: ProtocolFilter;
  filterStatus: StatusFilter;
}

const PREFS_STORAGE_KEY = 'vpn_nodes_prefs_v1';
const PREFS_SCHEMA_VERSION = 1;

// Columnas opcionales por defecto visibles. Las fijas (Estado / Nodo /
// Acciones) NO entran aquí — siempre se renderizan.
export const DEFAULT_VISIBLE_NODE_COLS = ['vrf', 'lan', 'ip_tunnel', 'ppp_user'];

const DEFAULT_PREFS: NodesPreferences = {
  visibleCols: DEFAULT_VISIBLE_NODE_COLS,
  sortKey: 'default',
  sortDir: 'asc',
  searchQuery: '',
  filterProtocol: '',
  filterStatus: '',
};

const VALID_KEY_SET = new Set(['vrf', 'lan', 'ip_tunnel', 'ppp_user', 'tags', 'service', 'disabled', 'uptime']);

function sanitizeVisibleCols(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((k): k is string => typeof k === 'string' && VALID_KEY_SET.has(k));
  return out;
}

function sanitizeSortKey(raw: unknown): NodeSortKey {
  return raw === 'nombre_nodo' || raw === 'nombre_vrf' || raw === 'ip_tunnel' || raw === 'running' || raw === 'default'
    ? raw
    : 'default';
}

function sanitizeSortDir(raw: unknown): SortDir {
  return raw === 'desc' ? 'desc' : 'asc';
}

function sanitizeProtocol(raw: unknown): ProtocolFilter {
  return raw === 'sstp' || raw === 'wireguard' || raw === '' ? raw : '';
}

function sanitizeStatus(raw: unknown): StatusFilter {
  return raw === 'connected' || raw === 'disconnected' || raw === '' ? raw : '';
}

function sanitizeStr(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

function loadPrefs(): NodesPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const visibleCols = sanitizeVisibleCols(parsed.visibleCols);
        return {
          ...DEFAULT_PREFS,
          ...(visibleCols !== null ? { visibleCols } : {}),
          sortKey: sanitizeSortKey(parsed.sortKey),
          sortDir: sanitizeSortDir(parsed.sortDir),
          searchQuery: sanitizeStr(parsed.searchQuery),
          filterProtocol: sanitizeProtocol(parsed.filterProtocol),
          filterStatus: sanitizeStatus(parsed.filterStatus),
        };
      }
    }
  } catch { /* storage corrupto → defaults */ }
  return DEFAULT_PREFS;
}

function savePrefs(prefs: NodesPreferences): void {
  try {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: PREFS_SCHEMA_VERSION, ...prefs }),
    );
  } catch { /* quota / privacy mode — sin persistencia */ }
}

export interface UseNodesPreferencesReturn extends NodesPreferences {
  setVisibleCols: (cols: string[]) => void;
  setSortKey: (k: NodeSortKey) => void;
  setSortDir: (d: SortDir) => void;
  setSearchQuery: (s: string) => void;
  setFilterProtocol: (p: ProtocolFilter) => void;
  setFilterStatus: (s: StatusFilter) => void;
  /** Toggle de sort estándar: mismo key → flip dir; nuevo key → asc. */
  toggleSort: (k: NodeSortKey) => void;
  /** Resetea TODAS las preferencias al estado inicial. */
  resetPrefs: () => void;
}

export function useNodesPreferences(): UseNodesPreferencesReturn {
  const [prefs, setPrefs] = useState<NodesPreferences>(loadPrefs);

  // Debounce 300ms — agrupa cambios consecutivos en un solo write.
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

  // Flush sincrónico SOLO al desmontar con la versión más reciente vía ref.
  // Si la dep fuera [prefs] el cleanup correría en cada cambio y haría un
  // write SIN debounce (bug clásico, caza-test del §40).
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => () => { savePrefs(prefsRef.current); }, []);

  const setVisibleCols = useCallback((cols: string[]) => {
    setPrefs(p => ({ ...p, visibleCols: cols }));
  }, []);
  const setSortKey = useCallback((sortKey: NodeSortKey) => {
    setPrefs(p => ({ ...p, sortKey }));
  }, []);
  const setSortDir = useCallback((sortDir: SortDir) => {
    setPrefs(p => ({ ...p, sortDir }));
  }, []);
  const setSearchQuery = useCallback((searchQuery: string) => {
    setPrefs(p => ({ ...p, searchQuery }));
  }, []);
  const setFilterProtocol = useCallback((filterProtocol: ProtocolFilter) => {
    setPrefs(p => ({ ...p, filterProtocol }));
  }, []);
  const setFilterStatus = useCallback((filterStatus: StatusFilter) => {
    setPrefs(p => ({ ...p, filterStatus }));
  }, []);

  const toggleSort = useCallback((sortKey: NodeSortKey) => {
    setPrefs(p => {
      if (p.sortKey === sortKey) {
        if (p.sortDir === 'asc') return { ...p, sortDir: 'desc' };
        // 3er click: vuelve a default
        return { ...p, sortKey: 'default', sortDir: 'asc' };
      }
      return { ...p, sortKey, sortDir: 'asc' };
    });
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefs(DEFAULT_PREFS);
  }, []);

  return {
    ...prefs,
    setVisibleCols,
    setSortKey,
    setSortDir,
    setSearchQuery,
    setFilterProtocol,
    setFilterStatus,
    toggleSort,
    resetPrefs,
  };
}
