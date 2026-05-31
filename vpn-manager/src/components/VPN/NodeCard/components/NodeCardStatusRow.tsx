import type { NodeInfo } from '../../../../types/api';

interface NodeCardStatusRowProps {
  node: NodeInfo;
}

export function NodeCardStatusRow({ node }: NodeCardStatusRowProps) {
  return (
    <>
      {/* VRF */}
      <td className="px-4 py-3">
        <span
          className={`data-cell truncate block max-w-[200px] ${node.nombre_vrf ? '' : 'data-muted'}`}
          title={node.nombre_vrf}
        >
          {node.nombre_vrf || '— Sin VRF'}
        </span>
      </td>

      {/* Red LAN */}
      <td className="px-4 py-3">
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

      {/* IP Túnel */}
      <td className="px-4 py-3">
        <span className={node.ip_tunnel ? 'data-cell' : 'data-muted'}>
          {node.ip_tunnel || '—'}
        </span>
      </td>

      {/* Usuario PPP */}
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-slate-500 truncate block max-w-[180px]" title={node.ppp_user}>
          {node.ppp_user}
        </span>
      </td>
    </>
  );
}
