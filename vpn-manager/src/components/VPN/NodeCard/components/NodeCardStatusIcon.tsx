import { Radio, Loader2, Wifi, WifiOff } from 'lucide-react';
import type { NodeInfo } from '../../../../types/api';

interface NodeCardStatusIconProps {
  node: NodeInfo;
  isThisNodeActive: boolean;
  isPending: boolean;
}

export function NodeCardStatusIcon({ node, isThisNodeActive, isPending }: NodeCardStatusIconProps) {
  return (
    <td className="px-4 py-3 w-10">
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
          ${isThisNodeActive
            ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
            : isPending
              ? 'bg-indigo-500 shadow-sm shadow-indigo-500/40'
              : node.running
                ? 'bg-sky-500 shadow-sm shadow-sky-500/30'
                : 'bg-slate-200'}`}
      >
        {isThisNodeActive ? (
          <Radio className="w-3.5 h-3.5 text-white animate-pulse" />
        ) : isPending ? (
          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
        ) : node.running ? (
          <Wifi className="w-3.5 h-3.5 text-white" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-slate-400" />
        )}
      </div>
    </td>
  );
}
