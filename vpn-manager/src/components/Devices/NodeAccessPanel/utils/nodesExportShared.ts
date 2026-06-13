// ============================================================
//  nodesExportShared — columnas + helpers compartidos por los exporters
//
//  Centralizar evita que CSV/JSON/Excel/PDF de Nodos diverjan.
//  Estructura paralela a Escanear (§40 exportShared.ts).
// ============================================================

import type { NodeInfo } from '../../../../types/api';

export interface NodeExportRow {
  node: NodeInfo;
  tags: string[];
}

export interface NodeExportColumn {
  header: string;
  jsonKey: string;
  get: (r: NodeExportRow) => string | number | null;
}

function protocolLabel(svc: string | undefined): string {
  if (svc === 'sstp') return 'SSTP';
  if (svc === 'wireguard') return 'WireGuard';
  return svc || '';
}

function statusLabel(n: NodeInfo): 'Conectado' | 'Desconectado' {
  return n.running ? 'Conectado' : 'Desconectado';
}

export const NODES_EXPORT_COLUMNS: NodeExportColumn[] = [
  { header: 'Nodo',         jsonKey: 'nombre_nodo', get: r => r.node.nombre_nodo ?? null },
  { header: 'VRF',          jsonKey: 'vrf',         get: r => r.node.nombre_vrf ?? null },
  { header: 'Red LAN',      jsonKey: 'lan',         get: r => {
      const subs = r.node.lan_subnets;
      if (subs && subs.length > 0) return [...new Set(subs)].join(' · ');
      return r.node.segmento_lan ?? null;
    }
  },
  { header: 'IP Túnel',     jsonKey: 'ipTunnel',    get: r => r.node.ip_tunnel ?? null },
  { header: 'Usuario PPP',  jsonKey: 'pppUser',     get: r => r.node.ppp_user ?? null },
  { header: 'Protocolo',    jsonKey: 'protocol',    get: r => protocolLabel(r.node.service) },
  { header: 'Estado',       jsonKey: 'status',      get: r => statusLabel(r.node) },
  { header: 'Habilitado',   jsonKey: 'enabled',     get: r => r.node.disabled ? 'No' : 'Sí' },
  { header: 'Tiempo activo', jsonKey: 'uptime',     get: r => r.node.uptime ?? null },
  { header: 'Etiquetas',    jsonKey: 'tags',        get: r => r.tags.length > 0 ? r.tags.join(', ') : null },
];

/** Subset reducido para el PDF — solo los 7 datos más importantes para hoja A4 landscape. */
export const NODES_PDF_COLUMNS: NodeExportColumn[] = NODES_EXPORT_COLUMNS.filter(c => [
  'nombre_nodo', 'vrf', 'lan', 'ipTunnel', 'protocol', 'status', 'uptime',
].includes(c.jsonKey));

export interface NodesExportMetadata {
  /** Cantidad total visible + cuántos están conectados. */
  totalCount: number;
  connectedCount: number;
  /** Filtros activos (para que el archivo refleje qué se exportó). */
  activeFilters?: string[];
  /** Hora de exportación. */
  scannedAt?: Date;
}

export function buildNodesFileName(ext: 'csv' | 'json' | 'xlsx' | 'pdf', meta: NodesExportMetadata): string {
  const date = (meta.scannedAt ?? new Date()).toISOString().slice(0, 10);
  return `nodos-${date}.${ext}`;
}

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
