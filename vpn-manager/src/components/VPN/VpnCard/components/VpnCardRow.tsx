import VpnCardStatusIcon from './VpnCardStatusIcon';
import VpnCardNameCell from './VpnCardNameCell';
import VpnCardServiceCell from './VpnCardServiceCell';
import VpnCardProfileCell from './VpnCardProfileCell';
import VpnCardIPCell from './VpnCardIPCell';
import VpnCardUptimeCell from './VpnCardUptimeCell';
import VpnCardActionsCell from './VpnCardActionsCell';
import VpnCardLogsRow from './VpnCardLogsRow';
import type { VpnSecret, VpnStatus } from '../types';

interface VpnCardRowProps {
  vpn: VpnSecret;
  rowIndex: number;
  status: VpnStatus;
  logs: string[];
  uptime: number;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  onActivate: () => void;
  onDeactivate: () => void;
  onRemove: () => void;
}

export default function VpnCardRow({
  vpn,
  rowIndex,
  status,
  logs,
  uptime,
  logsEndRef,
  onActivate,
  onDeactivate,
  onRemove,
}: VpnCardRowProps) {
  const isRunning = status === 'running';
  const isPending = status === 'activating' || status === 'deleting';
  const showLogs = logs.length > 0 || isPending;

  const rowBg = isRunning
    ? 'bg-emerald-50/60'
    : isPending
      ? 'bg-indigo-50/60'
      : rowIndex % 2 === 0
        ? 'bg-white'
        : 'bg-slate-50/40';

  const borderLeft = isRunning
    ? 'border-l-2 border-l-emerald-400'
    : isPending
      ? 'border-l-2 border-l-indigo-400'
      : 'border-l-2 border-l-transparent';

  return (
    <>
      <tr className={`${rowBg} ${borderLeft} transition-colors hover:bg-indigo-50/30`}>
        <VpnCardStatusIcon status={status} />
        <VpnCardNameCell name={vpn.name} />
        <VpnCardServiceCell service={vpn.service} />
        <VpnCardProfileCell profile={vpn.profile} />
        <VpnCardIPCell ip={vpn.ip} status={status} />
        <VpnCardUptimeCell uptime={uptime} status={status} />
        <VpnCardActionsCell
          status={status}
          onActivate={onActivate}
          onDeactivate={onDeactivate}
          onRemove={onRemove}
        />
      </tr>

      {showLogs && <VpnCardLogsRow logs={logs} logsEndRef={logsEndRef} rowBg={rowBg} />}
    </>
  );
}
