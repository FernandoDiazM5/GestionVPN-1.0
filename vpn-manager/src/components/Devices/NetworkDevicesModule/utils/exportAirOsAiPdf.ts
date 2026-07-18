import { downloadBlob } from './exportShared';
import { RISK_LABELS, type AirOsNetworkReportData } from './airOsAiReport';
import { buildAirOsDeviceFieldReports, type AirOsDeviceFieldReport } from './airOsFieldReport';

const VIOLET: [number, number, number] = [109, 40, 217];
const VIOLET_DARK: [number, number, number] = [76, 29, 149];
const SLATE: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [226, 232, 240];
const SURFACE: [number, number, number] = [248, 250, 252];
const AMBER: [number, number, number] = [217, 119, 6];
const BLUE: [number, number, number] = [37, 99, 235];
const EMERALD: [number, number, number] = [5, 150, 105];

function statusFor(deviceReport: AirOsDeviceFieldReport, parameter: string) {
  return deviceReport.problems.find(problem => problem.parameter === parameter)?.status || 'Sin observación';
}

function metricValue(value: number | null, unit: string) {
  return value == null ? 'N/D' : `${value} ${unit}`;
}

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
  const contentWidth = pageWidth - margin * 2;
  const dateText = new Date(report.snapshotAt).toLocaleString('es-PE');
  const deviceReports = buildAirOsDeviceFieldReports(report);

  const drawSectionTitle = (title: string, y: number, color: [number, number, number] = VIOLET) => {
    doc.setFillColor(...color);
    doc.roundedRect(margin, y - 9, 4, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(title, margin + 12, y + 2);
  };

  const wrappedHeight = (text: string, width: number, lineHeight = 11) =>
    doc.splitTextToSize(text, width).length * lineHeight;

  const drawOverviewHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...SLATE);
    doc.text('Informe de diagnóstico de receptores AirOS', margin, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Fecha: ${dateText}${report.subnet ? `  |  Subred: ${report.subnet}` : ''}`, margin, 58);
    doc.setDrawColor(...VIOLET);
    doc.setLineWidth(1.2);
    doc.line(margin, 69, pageWidth - margin, 69);
  };

  drawOverviewHeader();
  const summary = report.summary;
  const kpis = [
    ['STA evaluados', summary.sta],
    ['AP excluidos', summary.apExcluded],
    ['Seleccionados', summary.selected],
    ['Críticos', summary.critical],
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

  drawSectionTitle('Resumen consultivo', 145);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  const summaryLines = doc.splitTextToSize(report.analysis.summary, contentWidth - 12);
  doc.text(summaryLines, margin + 12, 162);
  const tableStartY = 170 + summaryLines.length * 10;

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin, bottom: 34 },
    head: [['Estado', 'Puntaje', 'Equipo', 'IP', 'AP asociado', 'Señal', 'SNR', 'CCQ', 'TX/RX', 'Problemas observados']],
    body: deviceReports.map(deviceReport => {
      const device = deviceReport.device;
      return [
        RISK_LABELS[device.level],
        `${device.score}/100`,
        device.name,
        device.ip,
        device.apName,
        metricValue(device.signal, 'dBm'),
        metricValue(device.snr, 'dB'),
        metricValue(device.ccq, '%'),
        `${device.txRate ?? '-'} / ${device.rxRate ?? '-'} Mbps`,
        deviceReport.title,
      ];
    }),
    styles: { fontSize: 7, cellPadding: 3.5, overflow: 'linebreak', textColor: SLATE, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: VIOLET, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: SURFACE },
  });

  const tableState = doc as unknown as { lastAutoTable?: { finalY: number } };
  const overviewEndY = (tableState.lastAutoTable?.finalY || tableStartY) + 18;
  if (report.analysis.limitations.length && overviewEndY < pageHeight - 48) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(`Limitaciones: ${report.analysis.limitations.join('; ')}`, contentWidth), margin, overviewEndY);
  }

  const drawDeviceHeader = (deviceReport: AirOsDeviceFieldReport, index: number, continuation = false) => {
    const { device } = deviceReport;
    doc.setFillColor(...VIOLET_DARK);
    doc.rect(0, 0, pageWidth, 62, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(221, 214, 254);
    doc.text(continuation ? `CONTINUACIÓN - CLIENTE ${String(index + 1).padStart(2, '0')}` : `ANÁLISIS POR CLIENTE ${String(index + 1).padStart(2, '0')}`, margin, 22);
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    const nameLines = doc.splitTextToSize(device.name, contentWidth - 190).slice(0, 2);
    doc.text(nameLines, margin, 42);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - margin - 124, 16, 124, 30, 5, 5, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('ESTADO DEL ENLACE', pageWidth - margin - 114, 28);
    doc.setFontSize(10);
    doc.setTextColor(...VIOLET_DARK);
    doc.text(`${RISK_LABELS[device.level]}  ${device.score}/100`, pageWidth - margin - 114, 40);
  };

  const drawInfoBox = (text: string, y: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(text, contentWidth - 28);
    const height = Math.max(48, lines.length * 11 + 22);
    doc.setFillColor(245, 243, 255);
    doc.setDrawColor(221, 214, 254);
    doc.roundedRect(margin, y, contentWidth, height, 6, 6, 'FD');
    doc.setTextColor(...SLATE);
    doc.text(lines, margin + 14, y + 19);
    return y + height;
  };

  const drawMetricCards = (deviceReport: AirOsDeviceFieldReport, y: number) => {
    const { device } = deviceReport;
    const metrics = [
      ['TX', metricValue(device.txRate, 'Mbps'), statusFor(deviceReport, 'Tasa TX')],
      ['RX', metricValue(device.rxRate, 'Mbps'), statusFor(deviceReport, 'Tasa RX')],
      ['Señal', metricValue(device.signal, 'dBm'), statusFor(deviceReport, 'Señal')],
      ['SNR', metricValue(device.snr, 'dB'), statusFor(deviceReport, 'SNR')],
      ['CCQ', metricValue(device.ccq, '%'), statusFor(deviceReport, 'CCQ')],
    ];
    const gap = 10;
    const width = (contentWidth - gap * 4) / 5;
    metrics.forEach(([label, value, status], index) => {
      const x = margin + index * (width + gap);
      doc.setFillColor(...SURFACE);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(x, y, width, 52, 5, 5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), x + 10, y + 14);
      doc.setFontSize(12);
      doc.setTextColor(...SLATE);
      doc.text(value, x + 10, y + 31);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(status === 'Sin observación' ? EMERALD[0] : AMBER[0], status === 'Sin observación' ? EMERALD[1] : AMBER[1], status === 'Sin observación' ? EMERALD[2] : AMBER[2]);
      doc.text(status, x + 10, y + 44);
    });
    return y + 52;
  };

  const drawTextPanel = (title: string, text: string, y: number, accent: [number, number, number]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(text, contentWidth - 32);
    const height = Math.max(46, lines.length * 10 + 30);
    doc.setFillColor(...SURFACE);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin, y, contentWidth, height, 5, 5, 'FD');
    doc.setFillColor(...accent);
    doc.roundedRect(margin, y, 5, height, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...accent);
    doc.text(title.toUpperCase(), margin + 16, y + 15);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE);
    doc.text(lines, margin + 16, y + 29);
    return y + height;
  };

  const actionPanelHeight = (items: string[], width: number) => {
    const list = items.length ? items : ['Sin comprobaciones adicionales para este bloque.'];
    return 32 + list.reduce((height, item) => height + wrappedHeight(item, width - 34, 9) + 3, 0);
  };

  const drawActionPanel = (title: string, items: string[], x: number, y: number, width: number, height: number, accent: [number, number, number]) => {
    const list = items.length ? items : ['Sin comprobaciones adicionales para este bloque.'];
    doc.setFillColor(...SURFACE);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, width, height, 6, 6, 'FD');
    doc.setFillColor(...accent);
    doc.roundedRect(x, y, width, 26, 6, 6, 'F');
    doc.rect(x, y + 18, width, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(title, x + 12, y + 17);
    let bulletY = y + 41;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    for (const item of list) {
      const lines = doc.splitTextToSize(item, width - 34);
      doc.setFillColor(...accent);
      doc.circle(x + 13, bulletY - 2.5, 2, 'F');
      doc.text(lines, x + 22, bulletY);
      bulletY += lines.length * 9 + 3;
    }
  };

  deviceReports.forEach((deviceReport, index) => {
    doc.addPage();
    drawDeviceHeader(deviceReport, index);
    let y = 82;
    drawSectionTitle('Resumen del Estado', y);
    y = drawInfoBox(`${deviceReport.aiInterpretation}\nProblemas observados: ${deviceReport.title}.`, y + 12) + 18;

    drawSectionTitle(`Análisis por Cliente: ${deviceReport.device.name}`, y);
    y += 15;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin, y, contentWidth, 33, 5, 5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('IP DEL EQUIPO', margin + 12, y + 13);
    doc.text('AP ASOCIADO', margin + 190, y + 13);
    doc.text('MODELO', margin + 500, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE);
    doc.text(deviceReport.device.ip, margin + 12, y + 26);
    doc.text(doc.splitTextToSize(deviceReport.device.apName, 280)[0], margin + 190, y + 26);
    doc.text(doc.splitTextToSize(deviceReport.device.model, 230)[0], margin + 500, y + 26);
    y += 44;

    drawSectionTitle('Métricas Clave', y);
    y = drawMetricCards(deviceReport, y + 12) + 14;

    const diagnoses = [...new Set(deviceReport.problems.map(problem => problem.diagnosis))];
    y = drawTextPanel('Problema Principal', `${deviceReport.title}. ${diagnoses.join(' ')}`, y, AMBER) + 7;
    const causes = deviceReport.possibleCauses.length
      ? deviceReport.possibleCauses.join('; ')
      : 'No se determinaron causas adicionales con el snapshot disponible.';
    y = drawTextPanel('Posibles Causas', causes, y, VIOLET) + 8;

    const gap = 14;
    const panelWidth = (contentWidth - gap) / 2;
    const remoteHeight = actionPanelHeight(deviceReport.remoteChecks, panelWidth);
    const fieldHeight = actionPanelHeight(deviceReport.fieldChecks, panelWidth);
    const actionHeight = Math.max(remoteHeight, fieldHeight);
    if (y + actionHeight > pageHeight - 28) {
      doc.addPage();
      drawDeviceHeader(deviceReport, index, true);
      y = 80;
    }
    drawActionPanel('Plan de Acción: Revisiones Remotas', deviceReport.remoteChecks, margin, y, panelWidth, actionHeight, BLUE);
    drawActionPanel('Plan de Acción: Revisiones en Campo', deviceReport.fieldChecks, margin + panelWidth + gap, y, panelWidth, actionHeight, EMERALD);
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Página ${page} de ${pageCount}  |  GestionVPN  |  Informe consultivo, sin acciones ejecutadas`, margin, pageHeight - 16);
  }

  return doc.output('blob');
}

export async function exportAirOsNetworkAnalysisPdf(report: AirOsNetworkReportData): Promise<void> {
  const blob = await createAirOsNetworkAnalysisPdf(report);
  const stamp = new Date(report.snapshotAt).toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, `diagnostico-receptores-airos-${stamp}.pdf`);
}
