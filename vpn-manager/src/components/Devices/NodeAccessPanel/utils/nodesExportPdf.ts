// ============================================================
//  nodesExportPdf — informe PDF del inventario de Nodos
//
//  • Header con título + fecha + filtros activos.
//  • Resumen: 2 KPIs (Total / Conectados).
//  • Tabla principal con NODES_PDF_COLUMNS (7 cols legibles A4 landscape).
//  • Footer "Página N de M · GestionVPN · fecha".
//  • jspdf + jspdf-autotable se cargan vía dynamic import.
// ============================================================

import {
  NODES_PDF_COLUMNS,
  buildNodesFileName,
  downloadBlob,
  type NodeExportRow,
  type NodesExportMetadata,
} from './nodesExportShared';

const INDIGO_600: [number, number, number] = [79, 70, 229];
const INDIGO_100: [number, number, number] = [224, 231, 255];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_700: [number, number, number] = [51, 65, 85];

export async function exportNodesToPdf(rows: NodeExportRow[], meta: NodesExportMetadata): Promise<void> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableModule as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 32;

  const scannedAt = meta.scannedAt ?? new Date();
  const fechaStr = scannedAt.toLocaleString('es-ES');

  // ── Header ─────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...SLATE_700);
  doc.text('Inventario de nodos VRF', marginX, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  const subline: string[] = [`Fecha: ${fechaStr}`];
  if (meta.activeFilters && meta.activeFilters.length > 0) {
    subline.push(`Filtros: ${meta.activeFilters.join(' · ')}`);
  }
  doc.text(subline.join('  ·  '), marginX, 60);

  doc.setDrawColor(...INDIGO_600);
  doc.setLineWidth(1.2);
  doc.line(marginX, 70, pageWidth - marginX, 70);

  // ── KPIs ───────────────────────────────────────────────────────
  const kpiY = 92;
  const kpis: { label: string; value: number }[] = [
    { label: 'Total',       value: meta.totalCount },
    { label: 'Conectados',  value: meta.connectedCount },
  ];
  const kpiBoxWidth = 100;
  const kpiGap = 12;
  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (kpiBoxWidth + kpiGap);
    doc.setFillColor(...INDIGO_100);
    doc.roundedRect(x, kpiY, kpiBoxWidth, 36, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.text(kpi.label.toUpperCase(), x + 8, kpiY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INDIGO_600);
    doc.text(String(kpi.value), x + 8, kpiY + 30);
  });

  // ── Tabla ──────────────────────────────────────────────────────
  const head = [NODES_PDF_COLUMNS.map(c => c.header)];
  const body = rows.map(r =>
    NODES_PDF_COLUMNS.map(c => {
      const v = c.get(r);
      return v == null ? '' : String(v);
    }),
  );

  autoTable(doc, {
    head,
    body,
    startY: kpiY + 52,
    margin: { left: marginX, right: marginX, bottom: 36 },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      overflow: 'linebreak',
      textColor: SLATE_700,
    },
    headStyles: {
      fillColor: INDIGO_600,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: (data: { pageNumber: number }) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_500);
      const totalPages =
        (doc as unknown as { internal: { getNumberOfPages: () => number } })
          .internal.getNumberOfPages();
      doc.text(
        `Página ${data.pageNumber} de ${totalPages}  ·  GestionVPN  ·  ${fechaStr}`,
        marginX,
        pageHeight - 18,
      );
    },
  });

  const blob = doc.output('blob');
  downloadBlob(blob, buildNodesFileName('pdf', meta));
}
