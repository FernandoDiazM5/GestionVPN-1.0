// ============================================================
//  exportJson — export estructurado del scan a JSON
//
//  Estructura intencional, NO `JSON.stringify(rows)` crudo:
//  • metadata (nodo, subred, fecha, contadores)
//  • devices: lista con jsonKey camelCase + valores tipados
//
//  Sin librerías externas — texto puro y blob ya tradicional.
// ============================================================

import type { DeviceRow } from '../hooks/useDeviceList';
import {
  EXPORT_COLUMNS,
  buildFileName,
  downloadBlob,
  type ExportMetadata,
} from './exportShared';

export function exportScanToJson(rows: DeviceRow[], meta: ExportMetadata): void {
  const scannedAt = (meta.scannedAt ?? new Date()).toISOString();

  const devices = rows.map(row => {
    const out: Record<string, string | number | null> = {};
    for (const col of EXPORT_COLUMNS) {
      out[col.jsonKey] = col.get(row);
    }
    return out;
  });

  const payload = {
    schema: 'gestionvpn.scan/v1',
    metadata: {
      nodeName: meta.nodeName ?? null,
      subnet: meta.subnet ?? null,
      scannedAt,
      totalCount: meta.totalCount,
      withStatsCount: meta.withStatsCount,
      savedCount: meta.savedCount,
    },
    devices,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  downloadBlob(blob, buildFileName('json', meta));
}
