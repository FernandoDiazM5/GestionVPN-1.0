// ============================================================
//  nodesExportXlsx — export del inventario de Nodos a Excel (.xlsx)
//
//  • Título indigo + metadata (fecha + contadores + filtros activos).
//  • Header bold con fill indigo-100.
//  • Freeze pane en fila 5 para que el header siga visible al scrollear.
//  • exceljs se importa dinámicamente — chunk lazy, no impacta bundle inicial.
// ============================================================

import {
  NODES_EXPORT_COLUMNS,
  buildNodesFileName,
  downloadBlob,
  type NodeExportRow,
  type NodesExportMetadata,
} from './nodesExportShared';

const HEADER_FILL = 'FFE0E7FF';
const HEADER_FONT = 'FF3730A3';

export async function exportNodesToXlsx(rows: NodeExportRow[], meta: NodesExportMetadata): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'GestionVPN';
  wb.created = meta.scannedAt ?? new Date();

  const sheet = wb.addWorksheet('Nodos', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  // Fila 1 — título
  const titleRow = sheet.addRow(['Inventario de nodos VRF']);
  titleRow.font = { bold: true, size: 14, color: { argb: HEADER_FONT } };
  sheet.mergeCells(1, 1, 1, NODES_EXPORT_COLUMNS.length);

  // Fila 2 — metadatos
  const fechaStr = (meta.scannedAt ?? new Date()).toLocaleString('es-ES');
  const metaParts = [
    `Fecha: ${fechaStr}`,
    `Total: ${meta.totalCount}`,
    `Conectados: ${meta.connectedCount}`,
    ...(meta.activeFilters && meta.activeFilters.length > 0
      ? [`Filtros: ${meta.activeFilters.join(' · ')}`]
      : []),
  ];
  const metaRow = sheet.addRow([metaParts.join(' · ')]);
  metaRow.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  sheet.mergeCells(2, 1, 2, NODES_EXPORT_COLUMNS.length);

  // Fila 3 — separador
  sheet.addRow([]);

  // Fila 4 — header de columnas
  const headerRow = sheet.addRow(NODES_EXPORT_COLUMNS.map(c => c.header));
  headerRow.font = { bold: true, color: { argb: HEADER_FONT } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFC7D2FE' } } };
  });

  for (const row of rows) {
    const values = NODES_EXPORT_COLUMNS.map(c => {
      const v = c.get(row);
      return v == null ? null : v;
    });
    sheet.addRow(values);
  }

  NODES_EXPORT_COLUMNS.forEach((col, idx) => {
    const colObj = sheet.getColumn(idx + 1);
    const maxLen = Math.min(
      40,
      Math.max(
        col.header.length,
        ...rows.slice(0, 50).map(r => {
          const v = col.get(r);
          return v == null ? 0 : String(v).length;
        }),
      ) + 2,
    );
    colObj.width = Math.max(10, maxLen);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, buildNodesFileName('xlsx', meta));
}
