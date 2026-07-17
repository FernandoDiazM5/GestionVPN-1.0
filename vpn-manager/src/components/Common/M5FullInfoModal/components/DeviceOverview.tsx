import { Cpu, Gauge, MemoryStick, Radio } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AntennaStats } from '../../../../types/devices';
import { formatDBm, formatMHz, formatPercent } from '../utils/formatters';

interface MetricProps {
  label: string;
  value: string;
  icon: ReactNode;
  tone: string;
}

function Metric({ label, value, icon, tone }: MetricProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/70">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-3xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-0.5 break-words font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function DeviceOverview({ stats }: { stats: AntennaStats }) {
  return (
    <section aria-label="Resumen operativo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        label="Señal"
        value={stats.signal != null ? formatDBm(stats.signal) : '—'}
        icon={<Radio className="h-4 w-4" />}
        tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
      />
      <Metric
        label="CCQ"
        value={stats.ccq != null ? formatPercent(stats.ccq) : '—'}
        icon={<Gauge className="h-4 w-4" />}
        tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      />
      <Metric
        label="Frecuencia"
        value={stats.frequency != null ? formatMHz(stats.frequency) : '—'}
        icon={<Radio className="h-4 w-4" />}
        tone="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
      />
      <Metric
        label="CPU / memoria"
        value={`${stats.cpuLoad != null ? formatPercent(stats.cpuLoad) : '—'} / ${stats.memoryPercent != null ? formatPercent(stats.memoryPercent) : '—'}`}
        icon={stats.memoryPercent != null && stats.memoryPercent > 80
          ? <MemoryStick className="h-4 w-4" />
          : <Cpu className="h-4 w-4" />}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      />
    </section>
  );
}
