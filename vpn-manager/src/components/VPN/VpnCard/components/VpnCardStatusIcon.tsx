import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { VpnStatus } from '../types';

interface VpnCardStatusIconProps {
  status: VpnStatus;
}

export default function VpnCardStatusIcon({ status }: VpnCardStatusIconProps) {
  const isRunning = status === 'running';
  const isPending = status === 'activating' || status === 'deleting';

  return (
    <td className="px-4 py-3 w-10">
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
          ${isRunning
            ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
            : isPending
              ? 'bg-indigo-500 shadow-sm shadow-indigo-500/40'
              : 'bg-slate-200 dark:bg-slate-700'}`}
      >
        {isRunning ? (
          <Wifi className="w-3.5 h-3.5 text-white" />
        ) : isPending ? (
          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-slate-400" />
        )}
      </div>
    </td>
  );
}
