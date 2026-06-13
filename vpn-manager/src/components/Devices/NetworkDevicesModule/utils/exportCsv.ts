// ============================================================
//  exportCsv — exporta el scan visible a CSV (Excel-friendly)
//
//  - BOM UTF-8 (U+FEFF) inicial para que Excel detecte UTF-8 al abrir.
//  - Encabezado en español + 1 fila por DeviceRow.
//  - Campos con coma/comilla/newline se escapan con comillas dobles
//    (RFC 4180 — doble comilla interna -> "").
//  - Nombre del archivo: scan-<nodo>-YYYY-MM-DD.csv.
//
//  Desde §40 reusa EXPORT_COLUMNS para no divergir con XLSX/JSON/PDF.
// ============================================================

import type { DeviceRow } from '../hooks/useDeviceList';
import {
  EXPORT_COLUMNS,
  buildFileName,
  downloadBlob,
  type ExportMetadata,
} from './exportShared';

function escapeCell(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// U+FEFF BYTE ORDER MARK. Excel detecta UTF-8 cuando el archivo arranca con él.
// Construido con fromCharCode para no inyectar irregular whitespace en fuente.
const UTF8_BOM = String.fromCharCode(0xFEFF);

export function exportScanToCsv(rows: DeviceRow[], meta: ExportMetadata): void {
  const headerLine = EXPORT_COLUMNS.map(c => escapeCell(c.header)).join(',');
  const dataLines = rows.map(row =>
    EXPORT_COLUMNS.map(c => escapeCell(c.get(row))).join(',')
  );
  const content = UTF8_BOM + [headerLine, ...dataLines].join('\n');

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, buildFileName('csv', meta));
}
