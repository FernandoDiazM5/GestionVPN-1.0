import React from 'react';

interface NodeCardLogsSectionProps {
  showLogs: boolean;
  logs: string[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  rowIndex: number;
  isPending: boolean;
  isThisNodeActive: boolean;
}

export function NodeCardLogsSection({
  showLogs,
  logs,
  logsEndRef,
  rowIndex,
  isPending,
  isThisNodeActive,
}: NodeCardLogsSectionProps) {
  if (!showLogs) return null;

  const rowBg = isThisNodeActive
    ? 'bg-emerald-50/60 dark:bg-emerald-500/10'
    : isPending
      ? 'bg-indigo-50/60 dark:bg-indigo-500/10'
      : rowIndex % 2 === 0
        ? 'bg-white dark:bg-slate-900'
        : 'bg-slate-50/40 dark:bg-slate-800/40';

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
