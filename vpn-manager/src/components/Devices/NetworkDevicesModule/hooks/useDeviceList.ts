// ============================================================
//  useDeviceList — filtra, busca y ordena ScannedDevice[]
//
//  Recibe scanResults + savedIds y devuelve los rows derivados
//  (con flag isSaved + devId calculado), filtrados por search
//  query y SSID, y ordenados por la columna elegida.
// ============================================================

import { useState, useMemo, useCallback, useDeferredValue } from 'react';
import type { ScannedDevice } from '../../../../types/devices';

type SortDir = 'asc' | 'desc';
/** Filtros mutuamente excluyentes por rol del device. `''` = todos. */
export type RoleFilter = '' | 'ap' | 'sta' | 'unknown';

export interface DeviceRow {
  dev: ScannedDevice;
  isSaved: boolean;
  devId: string;
}

/** Normaliza el modo crudo (cachedStats.mode || dev.role) a 3 categorías. */
function normalizeRole(dev: ScannedDevice): 'ap' | 'sta' | 'unknown' {
  const raw = dev.cachedStats?.mode || dev.role;
  if (raw === 'ap' || raw === 'master') return 'ap';
  if (raw === 'sta') return 'sta';
  return 'unknown';
}

interface UseDeviceListInput {
  scanResults: ScannedDevice[];
  savedIds: Set<string>;
}

// Sort por defecto = señal desc. Es lo más útil cuando la tabla termina de
// auth: los dispositivos con mejor señal arriba, los caídos / sin stats abajo
// (la rama `?? -999` los manda al final). El usuario puede romper este
// orden haciendo click en cualquier header.
const DEFAULT_SORT: { key: string; dir: SortDir } = { key: 'signal', dir: 'desc' };

export function useDeviceList({ scanResults, savedIds }: UseDeviceListInput) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSSID, setFilterSSID] = useState('');
  const [filterRole, setFilterRole] = useState<RoleFilter>('');
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: SortDir } | null>(DEFAULT_SORT);

  const toggleSort = useCallback((key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }, []);

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

  // Filtro por search query (IP/nombre/SSID/MAC) + SSID seleccionado.
  // useDeferredValue separa el typing del input del recálculo del filter:
  // React puede mantener el input fluido mientras el filtrado de miles de
  // filas corre en una transición de baja prioridad. Patrón vercel
  // rerender-use-deferred-value.
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
