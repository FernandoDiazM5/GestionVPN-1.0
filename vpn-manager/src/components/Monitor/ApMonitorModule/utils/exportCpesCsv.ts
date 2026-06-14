// ============================================================
//  exportCpesCsv (E4) — export del Station List a CSV (UTF-8 con BOM).
//  Sin dependencias (no usa exceljs → evita su vuln transitiva de uuid).
//  Comma-delimited estándar con quoting RFC-4180; BOM para que Excel
//  respete los acentos.
// ============================================================
import type { LiveCpe } from '../../../../types/apMonitor';

type Col = { header: string; value: (c: LiveCpe) => string | number };

const COLUMNS: Col[] = [
  { header: 'MAC', value: c => c.mac },
  { header: 'Nombre', value: c => c.remote_hostname || c.cpe_name || c.hostname || '' },
  { header: 'Modelo', value: c => c.cpe_product || c.modelo || '' },
  { header: 'Senal_AP_dBm', value: c => c.signal ?? '' },
  { header: 'Senal_CPE_dBm', value: c => c.remote_signal ?? '' },
  { header: 'Noise_dBm', value: c => c.noisefloor ?? '' },
  { header: 'CINR_dB', value: c => c.airmax_cinr_rx ?? '' },
  { header: 'CCQ_pct', value: c => c.ccq ?? '' },
  { header: 'TX_Mbps', value: c => c.tx_rate ?? '' },
  { header: 'RX_Mbps', value: c => c.rx_rate ?? '' },
  { header: 'Distancia_m', value: c => c.distance ?? '' },
  { header: 'Uptime', value: c => c.uptimeStr ?? '' },
  { header: 'Ultima_IP', value: c => c.lastip ?? '' },
  { header: 'Firmware', value: c => c.firmware_family ?? '' },
];

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Construye el contenido CSV (exportado aparte para poder testearlo sin DOM). */
export function buildCpesCsv(stations: LiveCpe[]): string {
  const lines = [COLUMNS.map(c => c.header).join(',')];
  for (const c of stations) lines.push(COLUMNS.map(col => csvCell(col.value(c))).join(','));
  return '﻿' + lines.join('\r\n');
}

/** Dispara la descarga del CSV en el navegador. */
export function exportCpesCsv(stations: LiveCpe[], apName: string): void {
  const blob = new Blob([buildCpesCsv(stations)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (apName || 'cpes').replace(/[^\w.-]+/g, '_').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `cpes_${safe}_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
