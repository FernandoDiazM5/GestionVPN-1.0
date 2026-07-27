import React from 'react';
import { X } from 'lucide-react';

interface NodeCardLogsSectionProps {
  showLogs: boolean;
  logs: string[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  rowIndex: number;
  isPending: boolean;
  isThisNodeActive: boolean;
  onClose: () => void;
}

export function NodeCardLogsSection({
  showLogs,
  logs,
  logsEndRef,
  rowIndex,
  isPending,
  isThisNodeActive,
  onClose,
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
        <div className="relative ml-10 bg-slate-900 rounded-xl px-4 py-3 max-h-[80px] overflow-y-auto">
          {!isPending && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar mensajes del nodo"
              title="Cerrar mensajes"
              className="absolute right-2 top-2 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="console-text space-y-0.5 pr-7 text-2xs text-emerald-400">
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
