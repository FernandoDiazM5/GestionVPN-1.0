import type { VpnStatus } from '../types';

interface VpnCardIPCellProps {
  ip: string | undefined;
  status: VpnStatus;
}

export default function VpnCardIPCell({ ip, status }: VpnCardIPCellProps) {
  const isRunning = status === 'running';

  return (
    <td className="px-4 py-3">
      <span className={`font-mono text-xs font-semibold ${isRunning ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500'}`}>
        {ip ?? '—'}
      </span>
    </td>
  );
}
