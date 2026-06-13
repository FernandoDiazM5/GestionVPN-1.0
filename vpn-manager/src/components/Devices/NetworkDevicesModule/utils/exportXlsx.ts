// ============================================================
//  exportXlsx — export del scan a Excel (.xlsx) con formato
//
//  Hoja "Escaneo" con:
//  • Fila 1: título "Escaneo de red — <nodo>".
//  • Fila 2: metadatos (subred, fecha, contadores).
//  • Fila 4: header de columnas con bold + fill índigo claro.
//  • Filas 5+: datos. Numéricos como number puro, strings como text.
//  • Anchos auto-ajustados (cap 32 chars).
//  • Freeze pane en fila 5 — la cabecera siempre visible al scrollear.
//
//  exceljs se importa dinámicamente. El chunk queda separado del
//  bundle inicial — solo se descarga cuando el usuario abre el
//  menú Exportar y elige "Excel".
// ============================================================

import type { DeviceRow } from '../hooks/useDeviceList';
import {
  EXPORT_COLUMNS,
  buildFileName,
  downloadBlob,
  type ExportMetadata,
} from './exportShared';

const HEADER_FILL = 'FFE0E7FF';  // indigo-100
const HEADER_FONT = 'FF3730A3';  // indigo-700

export async function exportScanToXlsx(rows: DeviceRow[], meta: ExportMetadata): Promise<void> {
  // Dynamic import — chunk lazy, no impacta bundle inicial.
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'GestionVPN';
  wb.created = meta.scannedAt ?? new Date();

  const sheet = wb.addWorksheet('Escaneo', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  // Fila 1 — título
  const titleRow = sheet.addRow([
    meta.nodeName ? `Escaneo de red — ${meta.nodeName}` : 'Escaneo de red',
  ]);
  titleRow.font = { bold: true, size: 14, color: { argb: HEADER_FONT } };
  sheet.mergeCells(1, 1, 1, EXPORT_COLUMNS.length);

  // Fila 2 — metadatos
  const fechaStr = (meta.scannedAt ?? new Date()).toLocaleString('es-ES');
  const metaParts: string[] = [
    meta.subnet ? `Subred: ${meta.subnet}` : '',
    `Fecha: ${fechaStr}`,
    `Total: ${meta.totalCount}`,
    `Con stats: ${meta.withStatsCount}`,
    `Guardados: ${meta.savedCount}`,
  ].filter(Boolean);
  const metaRow = sheet.addRow([metaParts.join(' · ')]);
  metaRow.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };  // slate-500
  sheet.mergeCells(2, 1, 2, EXPORT_COLUMNS.length);

  // Fila 3 — separador (vacía)
  sheet.addRow([]);

  // Fila 4 — header de columnas
  const headerRow = sheet.addRow(EXPORT_COLUMNS.map(c => c.header));
  headerRow.font = { bold: true, color: { argb: HEADER_FONT } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFC7D2FE' } } };  // indigo-200
  });

  // Filas 5+ — datos
  for (const row of rows) {
    const values = EXPORT_COLUMNS.map(c => {
      const v = c.get(row);
      // null / undefined → celda vacía; ExcelJS lo trata como tal.
      return v == null ? null : v;
    });
    sheet.addRow(values);
  }

  // Anchos auto-ajustados. Cap 32 para evitar columnas absurdas con SSIDs largos.
  EXPORT_COLUMNS.forEach((col, idx) => {
    const colObj = sheet.getColumn(idx + 1);
    const maxLen = Math.min(
      32,
      Math.max(
        col.header.length,
        ...rows.slice(0, 50).map(r => {
          const v = col.get(r);
          return v == null ? 0 : String(v).length;
        }),
      ) + 2,
    );
    colObj.width = Math.max(8, maxLen);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, buildFileName('xlsx', meta));
}
