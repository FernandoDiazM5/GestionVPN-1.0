// ============================================================
//  exportShared — columnas + helpers compartidos por los exporters
//
//  CSV / JSON / Excel / PDF comparten la misma "vista" del scan:
//  un conjunto fijo de columnas con header + getter. Cada exporter
//  decide cómo renderizarlas (CSV escape, XLSX cell, PDF cell...).
//
//  Centralizar evita que CSV y Excel queden inconsistentes (típico
//  bug: arreglas el orden en uno y olvidas el otro).
// ============================================================

import type { DeviceRow } from '../hooks/useDeviceList';

export interface ExportColumn {
  /** Texto del header — usado tal cual en CSV/JSON/Excel/PDF. */
  header: string;
  /** Clave técnica para JSON (camelCase). */
  jsonKey: string;
  /** Extrae el valor de un row. Retorna primitivo plano. */
  get: (r: DeviceRow) => string | number | null;
}

/**
 * Etiqueta del rol como debe aparecer en el export. Refleja lo que se ve en
 * la tabla — la columna Rol del scan muestra el valor crudo de
 * `cachedStats.mode` (campo string libre que viene del airOS) en mayúsculas
 * cuando no es uno de los 3 canónicos. Casos típicos en torres PTP:
 *   • 'ap' / 'master'     → AP
 *   • 'sta'               → CPE
 *   • 'ap-ptp', 'ap_ptp'  → AP-PTP (mostrado tal cual)
 *   • 'sta-ptp'           → STA-PTP
 *   • 'repeater', etc.    → REPEATER
 *   • vacío / 'unknown'   → Desconocido
 */
function roleLabel(r: DeviceRow): string {
  const raw = (r.dev.cachedStats?.mode || r.dev.role || '').toString().trim();
  if (!raw) return 'Desconocido';
  const lower = raw.toLowerCase();
  if (lower === 'ap' || lower === 'master') return 'AP';
  if (lower === 'sta') return 'CPE';
  if (lower === 'unknown') return 'Desconocido';
  // Cualquier otro modo (ap-ptp, sta-ptp, repeater, etc.) en mayúsculas.
  return raw.toUpperCase();
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'IP',                jsonKey: 'ip',          get: r => r.dev.ip ?? null },
  { header: 'MAC',               jsonKey: 'mac',         get: r => r.dev.cachedStats?.wlanMac ?? r.dev.mac ?? null },
  { header: 'Rol',               jsonKey: 'role',        get: r => roleLabel(r) },
  { header: 'Nombre',            jsonKey: 'name',        get: r => r.dev.cachedStats?.deviceName ?? r.dev.name ?? null },
  { header: 'Modelo',            jsonKey: 'model',       get: r => r.dev.cachedStats?.deviceModel ?? r.dev.model ?? null },
  { header: 'Firmware',          jsonKey: 'firmware',    get: r => r.dev.cachedStats?.firmwareVersion ?? r.dev.firmware ?? null },
  { header: 'SSID',              jsonKey: 'ssid',        get: r => r.dev.cachedStats?.essid ?? r.dev.essid ?? null },
  { header: 'AP padre',          jsonKey: 'parentAp',    get: r => r.dev.parentAp ?? null },
  { header: 'Frecuencia (MHz)',  jsonKey: 'frequencyMhz', get: r => r.dev.cachedStats?.frequency ?? r.dev.frequency ?? null },
  { header: 'Canal',             jsonKey: 'channel',     get: r => r.dev.cachedStats?.channelNumber ?? null },
  { header: 'Ancho canal (MHz)', jsonKey: 'channelWidthMhz', get: r => r.dev.cachedStats?.channelWidth ?? null },
  { header: 'Señal (dBm)',       jsonKey: 'signalDbm',   get: r => r.dev.cachedStats?.signal ?? null },
  { header: 'Piso ruido (dBm)',  jsonKey: 'noiseFloorDbm', get: r => r.dev.cachedStats?.noiseFloor ?? null },
  { header: 'CCQ (%)',           jsonKey: 'ccqPct',      get: r => r.dev.cachedStats?.ccq ?? null },
  { header: 'TX rate (Mbps)',    jsonKey: 'txRateMbps',  get: r => r.dev.cachedStats?.txRate ?? null },
  { header: 'RX rate (Mbps)',    jsonKey: 'rxRateMbps',  get: r => r.dev.cachedStats?.rxRate ?? null },
  { header: 'Distancia (m)',     jsonKey: 'distanceM',   get: r => r.dev.cachedStats?.distance ?? null },
  { header: 'TX power (dBm)',    jsonKey: 'txPowerDbm',  get: r => r.dev.cachedStats?.txPower ?? null },
  { header: 'CPU (%)',           jsonKey: 'cpuPct',      get: r => r.dev.cachedStats?.cpuLoad ?? null },
  { header: 'RAM (%)',           jsonKey: 'ramPct',      get: r => r.dev.cachedStats?.memoryPercent ?? null },
  { header: 'Uptime',            jsonKey: 'uptime',      get: r => r.dev.cachedStats?.uptimeStr ?? null },
  { header: 'AP MAC (remoto)',   jsonKey: 'apMac',       get: r => r.dev.cachedStats?.apMac ?? null },
  { header: 'Seguridad',         jsonKey: 'security',    get: r => r.dev.cachedStats?.security ?? null },
  { header: 'Modo red',          jsonKey: 'networkMode', get: r => r.dev.cachedStats?.networkMode ?? null },
  { header: 'SSH usuario',       jsonKey: 'sshUser',     get: r => r.dev.sshUser ?? null },
  { header: 'Guardado',          jsonKey: 'saved',       get: r => r.isSaved ? 'Sí' : 'No' },
];

/** Subconjunto reducido para el PDF — pensado para una hoja A4 legible. */
export const PDF_COLUMNS: ExportColumn[] = EXPORT_COLUMNS.filter(c => [
  'ip', 'role', 'name', 'ssid', 'signalDbm', 'ccqPct', 'txRateMbps', 'rxRateMbps', 'cpuPct', 'ramPct', 'uptime',
].includes(c.jsonKey));

export interface ExportMetadata {
  /** Nombre del nodo activo (o undefined si scan en subred manual). */
  nodeName?: string | null;
  /** Subred efectiva escaneada. */
  subnet?: string | null;
  /** Hora del scan (ISO) — por defecto = ahora. */
  scannedAt?: Date;
  /** Cantidad total filas + cuántas tienen stats SSH OK + cuántas guardadas. */
  totalCount: number;
  withStatsCount: number;
  savedCount: number;
}

/** Filename estable: scan-<nodo|subred>-YYYY-MM-DD.<ext>. */
export function buildFileName(ext: 'csv' | 'json' | 'xlsx' | 'pdf', meta: ExportMetadata): string {
  const date = (meta.scannedAt ?? new Date()).toISOString().slice(0, 10);
  const nodeSlug = meta.nodeName ? `-${meta.nodeName.replace(/[^a-z0-9_-]/gi, '_')}` : '';
  return `scan${nodeSlug}-${date}.${ext}`;
}

/** Helper para disparar el download desde un Blob ya construido. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
