import { memo, useCallback } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Wifi, Minus, Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { topologyDb } from '../../db/db';

function APNodeInner({ data }: NodeProps) {
  const d = data as {
    label: string;
    model: string;
    status: string;
    deviceId: string;
  };

  const group = useLiveQuery(
    () => topologyDb.apCpeGroups.where('apDeviceId').equals(d.deviceId).first(),
    [d.deviceId]
  );

  const toggleExpanded = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!group) return;
      topologyDb.apCpeGroups.update(group.id, {
        expanded: !group.expanded,
        updatedAt: Date.now(),
      });
    },
    [group]
  );

  const isExpanded = group?.expanded ?? true;
  const cpeCount = group?.cpeDeviceIds.length ?? 0;

  return (
    <div className="relative bg-white rounded-lg shadow-md border border-slate-200 px-3 py-3 min-w-[120px]">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-blue-400 !border-blue-500" />

      <div className="flex flex-col items-center gap-1">
        <div className="p-1.5 bg-emerald-50 rounded-md">
          <Wifi size={18} className="text-emerald-600" />
        </div>
        <span className="text-[13px] font-bold text-slate-800 leading-tight">{d.label}</span>
        <span className="text-[11px] text-slate-400 leading-tight">{d.model}</span>
        {cpeCount > 0 && (
          <span className="text-[10px] text-slate-400">{cpeCount} CPE{cpeCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Toggle CPE visibility button */}
      {cpeCount > 0 && (
        <button
          onClick={toggleExpanded}
          className="absolute right-[-30px] top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 rounded-full w-6 h-6 text-white text-xs flex items-center justify-center shadow-md transition-colors z-10"
          title={isExpanded ? 'Ocultar CPEs' : 'Mostrar CPEs'}
        >
          {isExpanded ? <Minus size={12} /> : <Plus size={12} />}
        </button>
      )}

      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-400 !border-blue-500" />
    </div>
  );
}

export const APNode = memo(APNodeInner);
