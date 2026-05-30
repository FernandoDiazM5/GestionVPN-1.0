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
          className={`font-mono text-xs font-semibold truncate block max-w-[140px]
            ${node.nombre_vrf ? 'text-indigo-600' : 'text-slate-300'}`}
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
              <span key={`${s}-${i}`} className="font-mono text-xs font-semibold text-sky-600">{s}</span>
            ))}
          </div>
        ) : (
          <span className={`font-mono text-xs font-semibold ${node.segmento_lan ? 'text-sky-600' : 'text-slate-300'}`}>
            {node.segmento_lan || '—'}
          </span>
        )}
      </td>

      {/* IP Túnel */}
      <td className="px-4 py-3">
        <span className={`font-mono text-xs font-semibold ${node.ip_tunnel ? 'text-emerald-600' : 'text-slate-300'}`}>
          {node.ip_tunnel || '—'}
        </span>
      </td>

      {/* Usuario PPP */}
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-slate-500 truncate block max-w-[140px]" title={node.ppp_user}>
          {node.ppp_user}
        </span>
      </td>
    </>
  );
}
