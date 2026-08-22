import type { AuditExportJsonResponse, AuditExportRow } from '@gestionvpn/contracts';

const INDIGO_600: [number, number, number] = [79, 70, 229];
const INDIGO_100: [number, number, number] = [224, 231, 255];
const SLATE_50: [number, number, number] = [248, 250, 252];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_700: [number, number, number] = [51, 65, 85];

type AutoTable = (doc: unknown, options: unknown) => void;

function value(value: string | null | undefined): string {
  return value?.trim() || '-';
}

function actor(row: AuditExportRow): string {
  return value(row.user_name || row.user_email || 'Sistema');
}

export function auditPdfFileName(to: number): string {
  return `actividad-${new Date(to).toISOString().slice(0, 10)}.pdf`;
}

export async function createAuditPdf(report: AuditExportJsonResponse): Promise<Blob> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableModule as { default: AutoTable }).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 32;
  const fromText = new Date(report.meta.from).toLocaleString('es-PE');
  const toText = new Date(report.meta.to).toLocaleString('es-PE');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...SLATE_700);
  doc.text('Actividad reciente - Joinpoint NOC', marginX, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_500);
  doc.text(`Periodo: ${fromText} a ${toText}  |  Retencion maxima: 7 dias`, marginX, 58);
  doc.setDrawColor(...INDIGO_600);
  doc.setLineWidth(1.2);
  doc.line(marginX, 69, pageWidth - marginX, 69);

  doc.setFillColor(...INDIGO_100);
  doc.roundedRect(marginX, 84, 112, 38, 4, 4, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE_500);
  doc.text('REGISTROS', marginX + 9, 97);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INDIGO_600);
  doc.text(String(report.meta.count), marginX + 9, 116);

  autoTable(doc, {
    startY: 138,
    margin: { left: marginX, right: marginX, bottom: 34 },
    head: [['Fecha y hora', 'Usuario', 'Accion', 'Tunel / sitio', 'IP', 'Detalle']],
    body: report.rows.map(row => [
      new Date(Number(row.created_at)).toLocaleString('es-PE'),
      actor(row),
      value(row.action),
      value(row.tunnel_id),
      value(row.ip_address),
      value(row.detail),
    ]),
    styles: { fontSize: 7.2, cellPadding: 3.5, overflow: 'linebreak', textColor: SLATE_700 },
    headStyles: { fillColor: INDIGO_600, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: SLATE_50 },
    columnStyles: {
      0: { cellWidth: 92 },
      1: { cellWidth: 108 },
      2: { cellWidth: 76 },
      3: { cellWidth: 120 },
      4: { cellWidth: 78 },
    },
    didDrawPage: (data: { pageNumber: number }) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_500);
      doc.text(`Pagina ${data.pageNumber}  |  Joinpoint NOC  |  Actividad de los ultimos 7 dias`, marginX, pageHeight - 17);
    },
  });

  return doc.output('blob');
}
