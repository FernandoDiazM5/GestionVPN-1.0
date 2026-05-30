interface VpnCardLogsRowProps {
  logs: string[];
  logsEndRef: React.RefObject<HTMLDivElement>;
  rowBg: string;
}

export default function VpnCardLogsRow({ logs, logsEndRef, rowBg }: VpnCardLogsRowProps) {
  return (
    <tr className={rowBg}>
      <td colSpan={7} className="px-4 pb-3 pt-0">
        <div className="ml-10 bg-slate-900 rounded-xl px-4 py-3 max-h-[80px] overflow-y-auto">
          <div className="console-text text-emerald-400 space-y-0.5 text-[11px]">
            {logs.map((log, i) => (
              <div key={i} className={i === logs.length - 1 ? 'text-white' : 'text-slate-500'}>
                › {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </td>
    </tr>
  );
}
