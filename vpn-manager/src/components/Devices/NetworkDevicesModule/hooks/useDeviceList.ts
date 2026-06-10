// ============================================================
//  useDeviceList — filtra, busca y ordena ScannedDevice[]
//
//  Recibe scanResults + savedIds y devuelve los rows derivados
//  (con flag isSaved + devId calculado), filtrados por search
//  query y SSID, y ordenados por la columna elegida.
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import type { ScannedDevice } from '../../../../types/devices';

type SortDir = 'asc' | 'desc';

export interface DeviceRow {
  dev: ScannedDevice;
  isSaved: boolean;
  devId: string;
}

interface UseDeviceListInput {
  scanResults: ScannedDevice[];
  savedIds: Set<string>;
}

export function useDeviceList({ scanResults, savedIds }: UseDeviceListInput) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSSID, setFilterSSID] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: SortDir } | null>(null);

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

  // Filtro por search query (IP/nombre/SSID/MAC) + SSID seleccionado
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const ssidFilter = filterSSID.toLowerCase();
    return scanRows.filter(({ dev }) => {
      const ssid = (dev.cachedStats?.essid ?? dev.essid ?? '').toLowerCase();
      const name = (dev.cachedStats?.deviceName ?? dev.name ?? '').toLowerCase();
      const ip = (dev.ip || '').toLowerCase();
      const mac = (dev.cachedStats?.wlanMac ?? dev.mac ?? '').toLowerCase();
      const matchesSearch = !q || ip.includes(q) || name.includes(q) || ssid.includes(q) || mac.includes(q);
      const matchesSSID = !ssidFilter || ssid === ssidFilter;
      return matchesSearch && matchesSSID;
    });
  }, [scanRows, searchQuery, filterSSID]);

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
    sortConfig, toggleSort,
    scanRows,
    filteredRows,
    sortedRows,
    uniqueSSIDs,
  };
}
