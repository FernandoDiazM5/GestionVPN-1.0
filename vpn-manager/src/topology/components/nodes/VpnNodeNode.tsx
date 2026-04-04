import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Network } from 'lucide-react';

function VpnNodeNodeInner({ data }: NodeProps) {
  const d = data as {
    label: string;
    model: string;
    status: string;
    vpnIp: string;
    vpnService: string;
    lanSegment: string;
  };

  const isOnline = d.status === 'online';
  const isWG = d.vpnService === 'wireguard';

  return (
    <div className={`bg-white rounded-lg shadow-md border px-4 py-3 min-w-[160px] ${
      isOnline ? 'border-indigo-300' : 'border-slate-200 opacity-70'
    }`}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-indigo-400 !border-indigo-500" />

      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-md ${isOnline ? 'bg-indigo-50' : 'bg-slate-50'}`}>
          <Network size={18} className={isOnline ? 'text-indigo-600' : 'text-slate-400'} />
        </div>
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-slate-800 leading-tight">{d.label}</span>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-[10px] text-slate-500">
              {isWG ? 'WireGuard' : 'SSTP'}
            </span>
          </div>
          {d.vpnIp && (
            <span className="text-[10px] text-slate-400 font-mono">{d.vpnIp}</span>
          )}
        </div>
      </div>

      <Handle type="target" id="top" position={Position.Top} className="!w-2 !h-2 !bg-indigo-400 !border-indigo-500" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-indigo-400 !border-indigo-500" />
    </div>
  );
}

export const VpnNodeNode = memo(VpnNodeNodeInner);
