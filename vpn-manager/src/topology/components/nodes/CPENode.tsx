import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Radio } from 'lucide-react';

function CPENodeInner({ data }: NodeProps) {
  const d = data as {
    label: string;
    model: string;
    status: string;
    signal?: number;
    ccq?: number;
  };

  const isOffline = d.status !== 'online';

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border px-3 py-2.5 min-w-[110px] transition-opacity ${
        isOffline ? 'border-slate-200 opacity-60' : 'border-blue-200'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-blue-400 !border-blue-500" />

      <div className="flex flex-col items-center gap-0.5">
        <Radio size={16} className={isOffline ? 'text-slate-300' : 'text-blue-500'} />
        <span className={`text-[12px] font-bold leading-tight ${isOffline ? 'text-slate-500' : 'text-blue-600'}`}>
          {d.label}
        </span>
        <span className="text-[10px] text-slate-400 leading-tight">{d.model}</span>
        {d.signal != null && !isOffline && (
          <span className={`text-[9px] font-mono font-medium ${
            d.signal > -65 ? 'text-emerald-600' :
            d.signal > -75 ? 'text-amber-600' : 'text-red-500'
          }`}>
            {d.signal} dBm
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-slate-300 !border-slate-400" />
    </div>
  );
}

export const CPENode = memo(CPENodeInner);
