// ============================================================
//  NodeCardStatusRow — celdas de datos por nodo (columnas opcionales)
//
//  Desde §44: renderiza condicionalmente según `visibleCols`. El orden
//  respetado es el del array — el ColumnPicker permite reordenar.
//
//  Columnas soportadas (key → contenido):
//   • vrf       → node.nombre_vrf (mono, truncado, sino "— Sin VRF")
//   • lan       → segmento_lan o lista de lan_subnets
//   • ip_tunnel → node.ip_tunnel
//   • ppp_user  → node.ppp_user (mono)
//   • tags      → tags[] como chips violet
//   • service   → badge SSTP / WG
//   • disabled  → "Habilitado" / "Deshabilitado"
//   • uptime    → node.uptime (texto plano)
//
//  Si `visibleCols` no se pasa (caso retrocompatible) se usa el set
//  histórico ['vrf','lan','ip_tunnel','ppp_user'].
// ============================================================

import type { NodeInfo } from '../../../../types/api';

interface NodeCardStatusRowProps {
  node: NodeInfo;
  visibleCols?: string[];
  tags?: string[];
}

const DEFAULT_COLS = ['vrf', 'lan', 'ip_tunnel', 'ppp_user'];

export function NodeCardStatusRow({ node, visibleCols, tags }: NodeCardStatusRowProps) {
  const cols = visibleCols ?? DEFAULT_COLS;

  return (
    <>
      {cols.map(key => {
        switch (key) {
          case 'vrf':
            return (
              <td key={key} className="px-4 py-3">
                <span
                  className={`data-cell truncate block max-w-[200px] ${node.nombre_vrf ? '' : 'data-muted'}`}
                  title={node.nombre_vrf}
                >
                  {node.nombre_vrf || '— Sin VRF'}
                </span>
              </td>
            );
          case 'lan':
            return (
              <td key={key} className="px-4 py-3">
                {node.lan_subnets && node.lan_subnets.length > 1 ? (
                  <div className="flex flex-col gap-0.5">
                    {[...new Set(node.lan_subnets)].map((s, i) => (
                      <span key={`${s}-${i}`} className="data-cell">{s}</span>
                    ))}
                  </div>
                ) : (
                  <span className={node.segmento_lan ? 'data-cell' : 'data-muted'}>
                    {node.segmento_lan || '—'}
                  </span>
                )}
              </td>
            );
          case 'ip_tunnel':
            return (
              <td key={key} className="px-4 py-3">
                <span className={node.ip_tunnel ? 'data-cell' : 'data-muted'}>
                  {node.ip_tunnel || '—'}
                </span>
              </td>
            );
          case 'ppp_user':
            return (
              <td key={key} className="px-4 py-3">
                <span className="font-mono text-xs text-slate-500 truncate block max-w-[180px]" title={node.ppp_user}>
                  {node.ppp_user}
                </span>
              </td>
            );
          case 'tags':
            return (
              <td key={key} className="px-4 py-3">
                {tags && tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                    {tags.slice(0, 3).map((t, i) => (
                      <span key={i} className="text-2xs font-semibold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30">
                        {t}
                      </span>
                    ))}
                    {tags.length > 3 && (
                      <span className="text-2xs text-slate-400">+{tags.length - 3}</span>
                    )}
                  </div>
                ) : <span className="data-muted">—</span>}
              </td>
            );
          case 'service':
            return (
              <td key={key} className="px-4 py-3">
                {node.service === 'wireguard' ? (
                  <span className="badge badge-accent">WG</span>
                ) : node.service === 'sstp' ? (
                  <span className="badge badge-info">SSTP</span>
                ) : <span className="data-muted">—</span>}
              </td>
            );
          case 'disabled':
            return (
              <td key={key} className="px-4 py-3">
                {node.disabled ? (
                  <span className="badge badge-danger">Deshabilitado</span>
                ) : (
                  <span className="badge badge-success">Habilitado</span>
                )}
              </td>
            );
          case 'uptime':
            return (
              <td key={key} className="px-4 py-3">
                <span className={node.uptime ? 'data-cell' : 'data-muted'}>
                  {node.uptime || '—'}
                </span>
              </td>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
