import { Clock } from 'lucide-react';
import { formatUptime } from '../utils';
import type { VpnStatus } from '../types';

interface VpnCardUptimeCellProps {
  uptime: number;
  status: VpnStatus;
}

export default function VpnCardUptimeCell({ uptime, status }: VpnCardUptimeCellProps) {
  const isRunning = status === 'running';

  return (
    <td className="px-4 py-3">
      <span
        className={`font-mono text-xs font-semibold flex items-center gap-1
          ${isRunning ? 'text-indigo-600' : 'text-slate-300'}`}
      >
        <Clock className="w-3 h-3 opacity-60" />
        {isRunning ? formatUptime(uptime) : '—'}
      </span>
    </td>
  );
}
