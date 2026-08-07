import type { NodeApReport, NodeApReportAp, NodeApReportCpe } from './nodeApReport';

const INDIGO_600: [number, number, number] = [79, 70, 229];
const INDIGO_100: [number, number, number] = [224, 231, 255];
const SLATE_50: [number, number, number] = [248, 250, 252];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_700: [number, number, number] = [51, 65, 85];
const AMBER_600: [number, number, number] = [217, 119, 6];
const ROSE_600: [number, number, number] = [225, 29, 72];

type AutoTable = (doc: unknown, options: unknown) => void;
type PdfDoc = {
  internal: {
    pageSize: { getWidth: () => number; getHeight: () => number };
    getNumberOfPages: () => number;
  };
  lastAutoTable?: { finalY: number };
  setFont: (family: string, style: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (...color: [number, number, number]) => void;
  setFillColor: (...color: [number, number, number]) => void;
  setDrawColor: (...color: [number, number, number]) => void;
  setLineWidth: (width: number) => void;
  text: (text: string | string[], x: number, y: number, options?: unknown) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  roundedRect: (x: number, y: number, width: number, height: number, rx: number, ry: number, style: string) => void;
  addPage: () => void;
  setPage: (page: number) => void;
  output: (type: 'blob') => Blob;
};

const STATUS_LABELS: Record<NodeApReportAp['status'], string> = {
  fresh: 'Actualizado',
  stale: 'Desactualizado',
  error: 'Error',
  'no-data': 'Sin información',
};

const HEALTH_LABELS: Record<NodeApReportCpe['health'], string> = {
  ok: 'Correcto',
  warning: 'Advertencia',
  critical: 'Crítico',
};

function text(value: string | number | null | undefined, suffix = ''): string {
  return value == null || value === '' ? '-' : `${value}${suffix}`;
}

function dateTime(value: number): string {
  return value > 0 ? new Date(value).toLocaleString('es-PE') : 'Sin información';
}

function safeFilePart(value: string): string {
  return (value || 'nodo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'nodo';
}

function addSectionTitle(doc: PdfDoc, title: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...SLATE_700);
  doc.text(title, 32, y);
  return y + 8;
}

function addApInventory(doc: PdfDoc, autoTable: AutoTable, report: NodeApReport, startY: number): number {
  autoTable(doc, {
    startY,
    margin: { left: 32, right: 32, bottom: 34 },
    head: [[
      'AP / IP', 'Modelo / firmware', 'SSID', 'Frecuencia', 'Canal',
      'TX', 'CPU', 'Mem.', 'CPE', 'Estado', 'Último dato',
    ]],
    body: report.aps.map(ap => [
      `${ap.name}\n${ap.ip}`,
      `${text(ap.model)}\n${text(ap.firmware)}`,
      text(ap.ssid),
      text(ap.frequency, ' MHz'),
      text(ap.channelWidth, ' MHz'),
      text(ap.txPower, ' dBm'),
      text(ap.cpuLoad, '%'),
      text(ap.memoryPercent, '%'),
      `${ap.cpeCount}${ap.cpeCountIsHistorical ? '*' : ''}`,
      `${STATUS_LABELS[ap.status]}${ap.hasSsh ? '' : '\nCredenciales requeridas'}`,
      dateTime(ap.polledAt),
    ]),
    styles: { fontSize: 6.7, cellPadding: 3, overflow: 'linebreak', textColor: SLATE_700 },
    headStyles: { fillColor: INDIGO_600, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: SLATE_50 },
    columnStyles: {
      0: { cellWidth: 85 },
      1: { cellWidth: 88 },
      2: { cellWidth: 82 },
      10: { cellWidth: 74 },
    },
  });
  return (doc.lastAutoTable?.finalY ?? startY) + 18;
}

function addCpeTable(doc: PdfDoc, autoTable: AutoTable, ap: NodeApReportAp, startY: number): number {
  const body = ap.cpes.map(cpe => [
    `${cpe.name}\n${text(cpe.ip)}\n${cpe.mac}`,
    text(cpe.model),
    text(cpe.signalAp),
    text(cpe.signalCpe),
    text(cpe.noiseFloor),
    text(cpe.snr),
    text(cpe.ccq),
    `${text(cpe.txRate)} / ${text(cpe.rxRate)}`,
    `${text(cpe.airmaxQuality)} / ${text(cpe.airmaxCapacity)}`,
    text(cpe.distance),
    text(cpe.uptime),
    HEALTH_LABELS[cpe.health],
  ]);

  autoTable(doc, {
    startY,
    margin: { left: 32, right: 32, bottom: 34 },
    head: [[
      'CPE / IP / MAC', 'Modelo', 'Señal AP', 'Señal CPE', 'Ruido', 'SNR',
      'CCQ', 'TX/RX Mbps', 'AMQ/AMC', 'Dist. m', 'Uptime', 'Salud',
    ]],
    body: body.length ? body : [[
      'Sin CPEs en el último snapshot', '', '', '', '', '', '', '', '', '', '', '',
    ]],
    styles: { fontSize: 6.4, cellPadding: 2.7, overflow: 'linebreak', textColor: SLATE_700 },
    headStyles: { fillColor: [14, 116, 144], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: [240, 249, 255] },
    columnStyles: {
      0: { cellWidth: 105 },
      1: { cellWidth: 66 },
      10: { cellWidth: 55 },
    },
  });
  return (doc.lastAutoTable?.finalY ?? startY) + 16;
}

function addApDetailTable(doc: PdfDoc, autoTable: AutoTable, ap: NodeApReportAp, startY: number): number {
  const statusText = `${STATUS_LABELS[ap.status]}${ap.hasSsh ? '' : ' / Credenciales requeridas'}`;
  autoTable(doc, {
    startY,
    margin: { left: 32, right: 32, bottom: 34 },
    body: [
      ['Modelo', text(ap.model), 'Firmware', text(ap.firmware), 'Modo', text(ap.mode), 'Red', text(ap.networkMode)],
      ['MAC LAN', text(ap.lanMac), 'MAC WLAN', text(ap.wlanMac), 'SSID', text(ap.ssid), 'Seguridad', text(ap.security)],
      ['Frecuencia', text(ap.frequency, ' MHz'), 'Canal', text(ap.channelWidth, ' MHz'), 'TX', text(ap.txPower, ' dBm'), 'Cadenas', text(ap.chains)],
      ['Señal', text(ap.signal, ' dBm'), 'Ruido', text(ap.noiseFloor, ' dBm'), 'CCQ', text(ap.ccq, '%'), 'airMAX Q/C', `${text(ap.airmaxQuality)} / ${text(ap.airmaxCapacity)}`],
      ['CPU', text(ap.cpuLoad, '%'), 'Memoria', text(ap.memoryPercent, '%'), 'Uptime', text(ap.uptime), 'Temperatura', text(ap.temperature, ' °C')],
      ['LAN', text(ap.lanSpeed, ' Mbps'), 'Distancia', text(ap.distance, ' m'), 'Estado', statusText, 'Último poll', dateTime(ap.polledAt)],
      ['CPE', `${ap.cpeCount}${ap.cpeCountIsHistorical ? '*' : ''}`, 'Error', text(ap.error), '', '', '', ''],
    ],
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 2.8, overflow: 'linebreak', textColor: SLATE_700 },
    alternateRowStyles: { fillColor: SLATE_50 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: INDIGO_100, cellWidth: 58 },
      1: { cellWidth: 105 },
      2: { fontStyle: 'bold', fillColor: INDIGO_100, cellWidth: 58 },
      3: { cellWidth: 105 },
      4: { fontStyle: 'bold', fillColor: INDIGO_100, cellWidth: 58 },
      5: { cellWidth: 105 },
      6: { fontStyle: 'bold', fillColor: INDIGO_100, cellWidth: 62 },
    },
  });
  return (doc.lastAutoTable?.finalY ?? startY) + 14;
}

export async function createNodeApReportPdf(report: NodeApReport): Promise<Blob> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableModule as { default: AutoTable }).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }) as unknown as PdfDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 32;
  const generated = dateTime(report.generatedAt);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...SLATE_700);
  doc.text(`Informe de Monitor AP - ${report.nodeName}`, marginX, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_500);
  doc.text(`Generado: ${generated}  |  Último dato: ${dateTime(report.lastDataAt)}`, marginX, 58);
  doc.setDrawColor(...INDIGO_600);
  doc.setLineWidth(1.2);
  doc.line(marginX, 69, pageWidth - marginX, 69);

  const kpis = [
    { label: 'AP TOTAL', value: report.summary.apTotal, color: INDIGO_600 },
    { label: 'ACTUALIZADOS', value: report.summary.apFresh, color: [5, 150, 105] as [number, number, number] },
    { label: 'CPE LIVE', value: report.summary.cpeTotal, color: [8, 145, 178] as [number, number, number] },
    { label: 'DEGRADADOS', value: report.summary.cpeDegraded, color: AMBER_600 },
    { label: 'CRÍTICOS', value: report.summary.cpeCritical, color: ROSE_600 },
  ];
  kpis.forEach((kpi, index) => {
    const x = marginX + index * 112;
    doc.setFillColor(...INDIGO_100);
    doc.roundedRect(x, 84, 100, 37, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...SLATE_500);
    doc.text(kpi.label, x + 8, 97);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...kpi.color);
    doc.text(String(kpi.value), x + 8, 115);
  });

  let cursorY = addSectionTitle(doc, 'Inventario y estado de los AP', 145);
  cursorY = addApInventory(doc, autoTable, report, cursorY);

  const observations = [
    report.summary.apStale ? `${report.summary.apStale} AP con datos desactualizados.` : '',
    report.summary.apError ? `${report.summary.apError} AP con error en el último intento.` : '',
    report.summary.apNoData ? `${report.summary.apNoData} AP sin datos de monitoreo.` : '',
    report.summary.apWithoutSsh ? `${report.summary.apWithoutSsh} AP sin credenciales SSH disponibles.` : '',
    report.aps.some(ap => ap.cpeCountIsHistorical) ? '* Conteo CPE histórico; no pertenece al snapshot actual.' : '',
  ].filter(Boolean);
  if (observations.length) {
    if (cursorY > pageHeight - 75) {
      doc.addPage();
      cursorY = 42;
    }
    cursorY = addSectionTitle(doc, 'Calidad del snapshot', cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.text(observations.map(item => `- ${item}`), marginX, cursorY + 6);
    cursorY += observations.length * 10 + 18;
  }

  for (const ap of report.aps) {
    if (cursorY > pageHeight - 105) {
      doc.addPage();
      cursorY = 42;
    }
    cursorY = addSectionTitle(doc, `AP: ${ap.name} (${ap.ip})`, cursorY);
    cursorY = addApDetailTable(doc, autoTable, ap, cursorY);
    if (ap.cpes.length > 0) {
      if (cursorY > pageHeight - 80) {
        doc.addPage();
        cursorY = 42;
      }
      cursorY = addSectionTitle(doc, `CPE asociados - ${ap.cpes.length} en el snapshot`, cursorY);
      cursorY = addCpeTable(doc, autoTable, ap, cursorY);
    }
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...SLATE_500);
    doc.text(
      `Página ${page} de ${pageCount}  |  Joinpoint NOC  |  Snapshot consultivo, sin credenciales`,
      marginX,
      pageHeight - 16,
    );
  }

  return doc.output('blob');
}

export function nodeApReportFileName(report: NodeApReport): string {
  return `monitor_ap_${safeFilePart(report.nodeName)}_${new Date(report.generatedAt).toISOString().slice(0, 10)}.pdf`;
}

export async function exportNodeApReportPdf(report: NodeApReport): Promise<void> {
  const blob = await createNodeApReportPdf(report);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = nodeApReportFileName(report);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
