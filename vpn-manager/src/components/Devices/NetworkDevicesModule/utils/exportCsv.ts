// ============================================================
//  exportCsv — exporta el scan visible a CSV (Excel-friendly)
//
//  - BOM UTF-8 (U+FEFF) inicial para que Excel detecte UTF-8 al abrir.
//  - Encabezado en español + 1 fila por DeviceRow.
//  - Campos con coma/comilla/newline se escapan con comillas dobles
//    (RFC 4180 — doble comilla interna -> "").
//  - Nombre del archivo: scan-<nodo>-YYYY-MM-DD.csv.
// ============================================================

import type { DeviceRow } from '../hooks/useDeviceList';

const COLUMNS: { header: string; get: (r: DeviceRow) => string | number | undefined | null }[] = [
  { header: 'IP',               get: r => r.dev.ip },
  { header: 'MAC',              get: r => r.dev.cachedStats?.wlanMac || r.dev.mac },
  { header: 'Rol',              get: r => {
      const raw = r.dev.cachedStats?.mode || r.dev.role;
      if (raw === 'ap' || raw === 'master') return 'AP';
      if (raw === 'sta') return 'CPE';
      return 'Desconocido';
    }
  },
  { header: 'Nombre',           get: r => r.dev.cachedStats?.deviceName || r.dev.name },
  { header: 'Modelo',           get: r => r.dev.cachedStats?.deviceModel || r.dev.model },
  { header: 'Firmware',         get: r => r.dev.cachedStats?.firmwareVersion || r.dev.firmware },
  { header: 'SSID',             get: r => r.dev.cachedStats?.essid ?? r.dev.essid },
  { header: 'AP padre',         get: r => r.dev.parentAp },
  { header: 'Frecuencia (MHz)', get: r => r.dev.cachedStats?.frequency ?? r.dev.frequency },
  { header: 'Canal',            get: r => r.dev.cachedStats?.channelNumber },
  { header: 'Ancho canal (MHz)', get: r => r.dev.cachedStats?.channelWidth },
  { header: 'Señal (dBm)',      get: r => r.dev.cachedStats?.signal },
  { header: 'Piso ruido (dBm)', get: r => r.dev.cachedStats?.noiseFloor },
  { header: 'CCQ (%)',          get: r => r.dev.cachedStats?.ccq },
  { header: 'TX rate (Mbps)',   get: r => r.dev.cachedStats?.txRate },
  { header: 'RX rate (Mbps)',   get: r => r.dev.cachedStats?.rxRate },
  { header: 'Distancia (m)',    get: r => r.dev.cachedStats?.distance },
  { header: 'TX power (dBm)',   get: r => r.dev.cachedStats?.txPower },
  { header: 'CPU (%)',          get: r => r.dev.cachedStats?.cpuLoad },
  { header: 'RAM (%)',          get: r => r.dev.cachedStats?.memoryPercent },
  { header: 'Uptime',           get: r => r.dev.cachedStats?.uptimeStr },
  { header: 'AP MAC (remoto)',  get: r => r.dev.cachedStats?.apMac },
  { header: 'Seguridad',        get: r => r.dev.cachedStats?.security },
  { header: 'Modo red',         get: r => r.dev.cachedStats?.networkMode },
  { header: 'SSH usuario',      get: r => r.dev.sshUser },
  { header: 'Guardado',         get: r => r.isSaved ? 'Sí' : 'No' },
];

function escapeCell(value: string | number | undefined | null): string {
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

export function exportScanToCsv(rows: DeviceRow[], nodeName?: string | null): void {
  const headerLine = COLUMNS.map(c => escapeCell(c.header)).join(',');
  const dataLines = rows.map(row =>
    COLUMNS.map(c => escapeCell(c.get(row))).join(',')
  );
  const content = UTF8_BOM + [headerLine, ...dataLines].join('\n');

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  const nodePart = nodeName ? `-${nodeName.replace(/[^a-z0-9_-]/gi, '_')}` : '';
  a.download = `scan${nodePart}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
