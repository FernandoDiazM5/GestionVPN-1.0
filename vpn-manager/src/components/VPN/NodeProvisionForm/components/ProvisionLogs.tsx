import { Cpu } from 'lucide-react';

interface ProvisionLogsProps {
  logs: string[];
}

export function ProvisionLogs({ logs }: ProvisionLogsProps) {
  if (!logs.length) return null;

  return (
    <div className="bg-slate-900 rounded-xl p-3 max-h-[160px] overflow-y-auto">
      <div className="flex items-center space-x-1.5 mb-2">
        <Cpu className="w-3 h-3 text-slate-500" />
        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Provisioning</span>
      </div>
      <div className="console-text text-emerald-400 space-y-0.5">
        {logs.map((log, i) => (
          <div key={i} className={i === logs.length - 1 ? 'text-white' : 'text-slate-500'}>
            › {log}
          </div>
        ))}
      </div>
    </div>
  );
}
