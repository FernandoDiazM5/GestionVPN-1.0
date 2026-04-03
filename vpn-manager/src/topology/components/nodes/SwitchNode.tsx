import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Server } from 'lucide-react';

function SwitchNodeInner({ data }: NodeProps) {
  const d = data as {
    label: string;
    model: string;
    status: string;
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-slate-200 px-4 py-3 min-w-[140px]">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-blue-400 !border-blue-500" />

      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-blue-50 rounded-md">
          <Server size={18} className="text-blue-600" />
        </div>
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-slate-800 leading-tight">{d.label}</span>
          <span className="text-[11px] text-slate-400 leading-tight">{d.model}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-400 !border-blue-500" />
    </div>
  );
}

export const SwitchNode = memo(SwitchNodeInner);
