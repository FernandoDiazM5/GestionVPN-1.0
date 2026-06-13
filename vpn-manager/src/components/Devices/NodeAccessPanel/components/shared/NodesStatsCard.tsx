import { Server, Wifi, GitBranch, WifiOff } from 'lucide-react';

interface NodesStatsCardProps {
  total: number;
  connected: number;
  withVrf: number;
  disconnected: number;
  onFilterChange?: (filter: 'all' | 'connected' | 'vrf' | 'disconnected') => void;
}

export default function NodesStatsCard({
  total,
  connected,
  withVrf,
  disconnected,
  onFilterChange,
}: NodesStatsCardProps) {

  const stats = [
    {
      label: 'Total nodos',
      count: total,
      icon: Server,
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-500',
      numColor: 'text-slate-800',
      bar: 'bg-slate-400',
      barPct: 100,
      onClick: undefined,
    },
    {
      label: 'Conectados',
      count: connected,
      icon: Wifi,
      iconBg: 'bg-emerald-100 dark:bg-emerald-500/15',
      iconColor: 'text-emerald-600',
      numColor: 'text-emerald-700',
      bar: 'bg-emerald-400',
      barPct: total > 0 ? (connected / total) * 100 : 0,
      onClick: () => onFilterChange?.('connected'),
    },
    {
      label: 'Con VRF',
      count: withVrf,
      icon: GitBranch,
      iconBg: 'bg-sky-100 dark:bg-sky-500/15',
      iconColor: 'text-sky-600',
      numColor: 'text-sky-700',
      bar: 'bg-sky-400',
      barPct: total > 0 ? (withVrf / total) * 100 : 0,
      onClick: () => onFilterChange?.('vrf'),
    },
    {
      label: 'Desconectados',
      count: disconnected,
      icon: WifiOff,
      iconBg: 'bg-rose-100 dark:bg-rose-500/15',
      iconColor: 'text-rose-500',
      numColor: 'text-rose-600',
      bar: 'bg-rose-400',
      barPct: total > 0 ? (disconnected / total) * 100 : 0,
      onClick: () => onFilterChange?.('disconnected'),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(({ label, count, icon: Icon, iconBg, iconColor, numColor, bar, barPct, onClick }) => (
        <div
          key={label}
          onClick={onClick}
          className={`flex flex-col gap-3 p-4 rounded-xl bg-white border border-slate-200
                      transition-all duration-200 shadow-sm
                      dark:bg-slate-900 dark:border-slate-800
                      ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700' : 'cursor-default'}`}
        >
          {/* Header: ícono + label */}
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide leading-tight">
              {label}
            </span>
          </div>

          {/* Número */}
          <div className={`text-2xl font-bold ${numColor} leading-none`}>
            {count}
          </div>

          {/* Barra de progreso */}
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ${bar}`}
              style={{ width: `${barPct}%` }}
            />
          </div>

          {/* Porcentaje */}
          <span className="text-2xs text-slate-400 font-medium">
            {Math.round(barPct)}% del total
          </span>
        </div>
      ))}
    </div>
  );
}
