// ============================================================
//  nodesExportCsv — CSV Excel-friendly del inventario de Nodos
//
//  • BOM UTF-8 inicial → Excel detecta UTF-8 sin pasos extra.
//  • Escape RFC 4180 para comas/comillas/newlines.
//  • Filename: nodos-YYYY-MM-DD.csv
// ============================================================

import {
  NODES_EXPORT_COLUMNS,
  buildNodesFileName,
  downloadBlob,
  type NodeExportRow,
  type NodesExportMetadata,
} from './nodesExportShared';

function escapeCell(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const UTF8_BOM = String.fromCharCode(0xFEFF);

export function exportNodesToCsv(rows: NodeExportRow[], meta: NodesExportMetadata): void {
  const headerLine = NODES_EXPORT_COLUMNS.map(c => escapeCell(c.header)).join(',');
  const dataLines = rows.map(row =>
    NODES_EXPORT_COLUMNS.map(c => escapeCell(c.get(row))).join(',')
  );
  const content = UTF8_BOM + [headerLine, ...dataLines].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, buildNodesFileName('csv', meta));
}
