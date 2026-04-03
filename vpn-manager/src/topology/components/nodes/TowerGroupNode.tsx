import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Wifi, Minus, Plus, Network } from 'lucide-react';
import { topologyDb } from '../../db/db';

function TowerGroupNodeInner({ id, data }: NodeProps) {
  const d = data as {
    label: string;
    location: string;
    collapsed: boolean;
    width: number;
    height: number;
    deviceCount: number;
    vpnRunning?: boolean;
    vpnProtocol?: string;
    sourceType?: string;
  };

  const isVpn = d.sourceType === 'vpn_node';

  const toggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    topologyDb.towers.update(id, {
      collapsed: !d.collapsed,
      updatedAt: Date.now(),
    });
  };

  return (
    <div
      className={`rounded-xl border bg-slate-50/80 backdrop-blur-sm overflow-hidden ${
        isVpn && d.vpnRunning
          ? 'border-indigo-200'
          : isVpn
          ? 'border-red-200/60'
          : 'border-slate-200'
      }`}
      style={{
        width: d.width,
        height: d.collapsed ? 60 : d.height,
        transition: 'height 0.2s ease',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/60 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {isVpn ? (
            <Network size={16} className={d.vpnRunning ? 'text-indigo-500' : 'text-red-400'} />
          ) : (
            <Wifi size={16} className="text-blue-500" />
          )}
          <span className="text-sm font-bold text-slate-800">{d.label}</span>
          {isVpn && (
            <span
              className={`w-2 h-2 rounded-full ${
                d.vpnRunning ? 'bg-emerald-400' : 'bg-red-400'
              }`}
            />
          )}
          <span className="text-xs text-slate-400 font-medium">
            {d.deviceCount} Device{d.deviceCount !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={toggleCollapse}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
          title={d.collapsed ? 'Expandir' : 'Colapsar'}
        >
          {d.collapsed ? <Plus size={14} /> : <Minus size={14} />}
        </button>
      </div>
    </div>
  );
}

export const TowerGroupNode = memo(TowerGroupNodeInner);
