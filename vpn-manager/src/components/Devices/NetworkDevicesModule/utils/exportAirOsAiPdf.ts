import { downloadBlob } from './exportShared';
import { RISK_LABELS, type AirOsNetworkReportData } from './airOsAiReport';

const VIOLET: [number, number, number] = [109, 40, 217];
const SLATE: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];

export async function createAirOsNetworkAnalysisPdf(report: AirOsNetworkReportData): Promise<Blob> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableModule as { default: (doc: unknown, options: unknown) => void }).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 34;
  const dateText = new Date(report.snapshotAt).toLocaleString('es-PE');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...SLATE);
  doc.text('Informe de diagnostico de receptores AirOS', margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Fecha: ${dateText}${report.subnet ? `  |  Subred: ${report.subnet}` : ''}`, margin, 58);
  doc.setDrawColor(...VIOLET);
  doc.setLineWidth(1.2);
  doc.line(margin, 69, pageWidth - margin, 69);

  const summary = report.summary;
  const kpis = [
    ['STA evaluados', summary.sta],
    ['AP excluidos', summary.apExcluded],
    ['Seleccionados', summary.selected],
    ['Criticos', summary.critical],
    ['Malos', summary.bad],
  ] as const;
  kpis.forEach(([label, value], index) => {
    const x = margin + index * 116;
    doc.setFillColor(245, 243, 255);
    doc.roundedRect(x, 84, 104, 38, 4, 4, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 8, 97);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...VIOLET);
    doc.text(String(value), x + 8, 116);
    doc.setFont('helvetica', 'normal');
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...SLATE);
  doc.text('Resumen consultivo', margin, 145);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const summaryLines = doc.splitTextToSize(report.analysis.summary, pageWidth - margin * 2);
  doc.text(summaryLines, margin, 160);
  const tableStartY = 164 + summaryLines.length * 10;

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin, bottom: 34 },
    head: [['Estado', 'Puntaje', 'Equipo', 'IP', 'AP asociado', 'Señal', 'SNR', 'CCQ', 'TX/RX', 'Problemas locales']],
    body: report.devices.map(device => [
      RISK_LABELS[device.level],
      `${device.score}/100`,
      device.name,
      device.ip,
      device.apName,
      device.signal == null ? '-' : `${device.signal} dBm`,
      device.snr == null ? '-' : `${device.snr} dB`,
      device.ccq == null ? '-' : `${device.ccq}%`,
      `${device.txRate ?? '-'} / ${device.rxRate ?? '-'} Mbps`,
      device.reasons.slice(0, 3).map(reason => reason.label).join('; '),
    ]),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', textColor: SLATE },
    headStyles: { fillColor: VIOLET, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const tableState = doc as unknown as { lastAutoTable?: { finalY: number } };
  let cursorY = (tableState.lastAutoTable?.finalY || tableStartY) + 22;

  for (const [index, finding] of report.analysis.findings.entries()) {
    const affected = (finding.deviceIds || []).map(alias => {
      const device = report.devices.find(item => item.alias === alias);
      return device ? `${device.name} (${device.ip})` : alias;
    }).join(', ');
    const blocks = [
      `Equipos: ${affected || 'No especificado'}`,
      finding.interpretation,
      finding.evidence.length ? `Evidencia: ${finding.evidence.join('; ')}` : '',
      finding.possibleCauses.length ? `Posibles causas: ${finding.possibleCauses.join('; ')}` : '',
      finding.manualChecks.length ? `Comprobaciones manuales: ${finding.manualChecks.join('; ')}` : '',
    ].filter(Boolean);
    const lines = blocks.flatMap(text => doc.splitTextToSize(text, pageWidth - margin * 2 - 20));
    const height = 34 + lines.length * 9;
    if (cursorY + height > pageHeight - 42) {
      doc.addPage();
      cursorY = 40;
    }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, height, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(`${index + 1}. ${finding.title}`, margin + 10, cursorY + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(lines, margin + 10, cursorY + 30);
    cursorY += height + 10;
  }

  if (report.analysis.limitations.length) {
    const text = `Limitaciones: ${report.analysis.limitations.join('; ')}`;
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    if (cursorY + lines.length * 9 + 20 > pageHeight - 35) {
      doc.addPage();
      cursorY = 40;
    }
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(lines, margin, cursorY + 10);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Pagina ${page} de ${pageCount}  |  GestionVPN  |  Informe consultivo, sin acciones ejecutadas`, margin, pageHeight - 16);
  }

  return doc.output('blob');
}

export async function exportAirOsNetworkAnalysisPdf(report: AirOsNetworkReportData): Promise<void> {
  const blob = await createAirOsNetworkAnalysisPdf(report);
  const stamp = new Date(report.snapshotAt).toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, `diagnostico-receptores-airos-${stamp}.pdf`);
}
