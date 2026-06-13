// ============================================================
//  useDeviceList — filtra, busca y ordena ScannedDevice[]
//
//  Desde §40 es un "controlled hook": recibe searchQuery, filterSSID,
//  filterRole y sortConfig + sus setters desde el store consolidado
//  (useScanPreferences). Esto permite que la persistencia viva en un
//  solo lugar y que ambas instancias del módulo (raro pero posible)
//  vean siempre el mismo estado.
//
//  Internamente conserva el useDeferredValue para que el filtrado
//  no compita con el typing del input de búsqueda.
// ============================================================

import { useMemo, useCallback, useDeferredValue } from 'react';
import type { ScannedDevice } from '../../../../types/devices';
import type { RoleFilter, SortConfig } from './useScanPreferences';

export type { RoleFilter, SortConfig } from './useScanPreferences';

export interface DeviceRow {
  dev: ScannedDevice;
  isSaved: boolean;
  devId: string;
}

/**
 * Normaliza el modo crudo (`cachedStats.mode || dev.role`) a 3 categorías
 * para el filtro "Solo APs / Solo CPEs / Solo desconocidos". Acepta variantes
 * con prefijo separado por `-` o `_` para que los modos PTP también caigan
 * en su categoría natural:
 *   • 'ap', 'master', 'ap-ptp', 'ap_ptp', 'ap-something' → 'ap'
 *   • 'sta', 'sta-ptp', 'sta_ptp', 'sta-something'       → 'sta'
 *   • todo lo demás                                       → 'unknown'
 */
function normalizeRole(dev: ScannedDevice): 'ap' | 'sta' | 'unknown' {
  const raw = (dev.cachedStats?.mode || dev.role || '').toString().toLowerCase();
  if (raw === 'ap' || raw === 'master' || raw.startsWith('ap-') || raw.startsWith('ap_')) return 'ap';
  if (raw === 'sta' || raw.startsWith('sta-') || raw.startsWith('sta_')) return 'sta';
  return 'unknown';
}

interface UseDeviceListInput {
  scanResults: ScannedDevice[];
  savedIds: Set<string>;
  // Controlled — valores + setters desde useScanPreferences
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  filterSSID: string;
  setFilterSSID: (s: string) => void;
  filterRole: RoleFilter;
  setFilterRole: (r: RoleFilter) => void;
  sortConfig: SortConfig | null;
  setSortConfig: (updater: (prev: SortConfig | null) => SortConfig | null) => void;
}

export function useDeviceList({
  scanResults, savedIds,
  searchQuery, setSearchQuery,
  filterSSID, setFilterSSID,
  filterRole, setFilterRole,
  sortConfig, setSortConfig,
}: UseDeviceListInput) {
  const toggleSort = useCallback((key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }, [setSortConfig]);

  // Rows base con flag de "ya guardado en biblioteca local"
  const scanRows: DeviceRow[] = useMemo(() => scanResults.map(dev => {
    const id = dev.mac ? dev.mac.replace(/:/g, '') : dev.ip.replace(/\./g, '');
    return { dev, isSaved: savedIds.has(id), devId: id };
  }), [scanResults, savedIds]);

  // Lista de SSIDs únicos para el selector del dropdown
  const uniqueSSIDs = useMemo(() =>
    [...new Set(scanRows.map(({ dev }) => dev.cachedStats?.essid ?? dev.essid).filter(Boolean) as string[])],
    [scanRows]
  );

  // useDeferredValue separa typing → filter recompute. React mantiene
  // el input fluido mientras el filtrado corre en transición de baja prio.
  const deferredSearch = useDeferredValue(searchQuery);
  const filteredRows = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    const ssidFilter = filterSSID.toLowerCase();
    return scanRows.filter(({ dev }) => {
      const ssid = (dev.cachedStats?.essid ?? dev.essid ?? '').toLowerCase();
      const name = (dev.cachedStats?.deviceName ?? dev.name ?? '').toLowerCase();
      const ip = (dev.ip || '').toLowerCase();
      const mac = (dev.cachedStats?.wlanMac ?? dev.mac ?? '').toLowerCase();
      const matchesSearch = !q || ip.includes(q) || name.includes(q) || ssid.includes(q) || mac.includes(q);
      const matchesSSID = !ssidFilter || ssid === ssidFilter;
      const matchesRole = !filterRole || normalizeRole(dev) === filterRole;
      return matchesSearch && matchesSSID && matchesRole;
    });
  }, [scanRows, deferredSearch, filterSSID, filterRole]);

  // Ordenamiento por la columna elegida (sin clonar si no hay sort)
  const sortedRows = useMemo(() => {
    if (!sortConfig) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortConfig.key) {
        case 'ip': va = a.dev.ip; vb = b.dev.ip; break;
        case 'name':
          va = a.dev.cachedStats?.deviceName ?? a.dev.name ?? '';
          vb = b.dev.cachedStats?.deviceName ?? b.dev.name ?? ''; break;
        case 'essid':
          va = a.dev.cachedStats?.essid ?? a.dev.essid ?? '';
          vb = b.dev.cachedStats?.essid ?? b.dev.essid ?? ''; break;
        case 'signal':
          va = a.dev.cachedStats?.signal ?? -999;
          vb = b.dev.cachedStats?.signal ?? -999; break;
        case 'ccq':
          va = a.dev.cachedStats?.ccq ?? -1;
          vb = b.dev.cachedStats?.ccq ?? -1; break;
        case 'txPower':
          va = a.dev.cachedStats?.txPower ?? 0;
          vb = b.dev.cachedStats?.txPower ?? 0; break;
        case 'uptime':
          va = a.dev.cachedStats?.uptimeStr ?? '';
          vb = b.dev.cachedStats?.uptimeStr ?? ''; break;
        default: return 0;
      }
      if (va < vb) return sortConfig.dir === 'asc' ? -1 : 1;
      if (va > vb) return sortConfig.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortConfig]);

  return {
    searchQuery, setSearchQuery,
    filterSSID, setFilterSSID,
    filterRole, setFilterRole,
    sortConfig, toggleSort,
    scanRows,
    filteredRows,
    sortedRows,
    uniqueSSIDs,
  };
}
