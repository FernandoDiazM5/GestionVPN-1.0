import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Radio } from 'lucide-react';

function PTPNodeInner({ data }: NodeProps) {
  const d = data as {
    label: string;
    model: string;
    status: string;
    role: string;
  };

  const isStation = d.role === 'ptp_station';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative bg-white rounded-full w-16 h-16 flex items-center justify-center shadow-md border border-slate-200">
        <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-blue-400 !border-blue-500" />
        <Radio size={22} className={isStation ? 'text-sky-500' : 'text-blue-600'} />
        <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-400 !border-blue-500" />
      </div>
      <div className="text-center max-w-[100px]">
        <p className="text-[12px] font-bold text-slate-800 leading-tight truncate">{d.label}</p>
        <p className="text-[10px] text-slate-400 leading-tight truncate">{d.model}</p>
      </div>
    </div>
  );
}

export const PTPNode = memo(PTPNodeInner);
