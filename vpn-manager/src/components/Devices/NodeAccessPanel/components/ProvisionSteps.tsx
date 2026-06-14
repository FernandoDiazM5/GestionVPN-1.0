import { AlertCircle } from 'lucide-react';
import type { ProvisionStep } from '../utils';

interface ProvisionStepsProps {
  steps: ProvisionStep[];
  failedAt?: number;
  visible: number;
}

export default function ProvisionSteps({ steps, failedAt, visible }: ProvisionStepsProps) {
  return (
    <div className="space-y-1.5">
      {(steps ?? []).slice(0, visible).map(s => (
        <div key={String(s.step)} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs border
          animate-in fade-in slide-in-from-left-2 duration-200
          ${s.status === 'ok' ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30' : 'bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/30'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0
            ${s.status === 'ok' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            {s.status === 'ok' ? '✓' : '✗'}
          </span>
          <div className="min-w-0">
            <span className="font-bold text-slate-700">Paso {s.step} — {s.obj}</span>
            <p className="text-2xs text-slate-500 dark:text-slate-400 font-mono truncate">{s.name}</p>
          </div>
        </div>
      ))}
      {failedAt != null && failedAt > 0 && visible >= steps.length && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs border bg-amber-50 border-amber-100 animate-in fade-in duration-200 dark:bg-amber-500/10 dark:border-amber-500/30">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-amber-700 font-medium dark:text-amber-400">Falló en el paso {failedAt} — los pasos anteriores fueron aplicados</span>
        </div>
      )}
    </div>
  );
}
