// ============================================================
//  nodesExportJson — export estructurado del inventario de Nodos
//
//  Estructura tipo `gestionvpn.nodes/v1` con metadata + lista de nodos
//  en camelCase. Sin librerías externas.
// ============================================================

import {
  NODES_EXPORT_COLUMNS,
  buildNodesFileName,
  downloadBlob,
  type NodeExportRow,
  type NodesExportMetadata,
} from './nodesExportShared';

export function exportNodesToJson(rows: NodeExportRow[], meta: NodesExportMetadata): void {
  const scannedAt = (meta.scannedAt ?? new Date()).toISOString();

  const nodes = rows.map(row => {
    const out: Record<string, string | number | null> = {};
    for (const col of NODES_EXPORT_COLUMNS) {
      out[col.jsonKey] = col.get(row);
    }
    return out;
  });

  const payload = {
    schema: 'gestionvpn.nodes/v1',
    metadata: {
      exportedAt: scannedAt,
      totalCount: meta.totalCount,
      connectedCount: meta.connectedCount,
      activeFilters: meta.activeFilters ?? [],
    },
    nodes,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  downloadBlob(blob, buildNodesFileName('json', meta));
}
