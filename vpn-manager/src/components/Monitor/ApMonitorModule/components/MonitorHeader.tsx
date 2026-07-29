import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCw,
  Search,
  Users,
  X,
  ZapOff,
} from 'lucide-react';
import { fmtAgo } from '../utils/formatters';
import type { ApPollConnectionStatus } from '../hooks/useApPollEvents';

export type NodeFilter = 'active' | 'inactive' | 'all';

interface MonitorHeaderProps {
  nodeCount: number;
  apCount: number;
  cpeCount: number;
  nodeFilter: NodeFilter;
  search: string;
  connectionStatus: ApPollConnectionStatus;
  lastPolledAt: number;
  canSync: boolean;
  syncing: boolean;
  onFilterChange: (filter: NodeFilter) => void;
  onSearchChange: (value: string) => void;
  onSync: () => void;
}

const FILTERS = [
  {
    value: 'active',
    label: 'Sitio conectado',
    title: 'Antenas del sitio conectado',
    Icon: CheckCircle2,
    selectedClass: 'bg-emerald-700 text-white',
  },
  {
    value: 'inactive',
    label: 'Otros sitios',
    title: 'Antenas de otros sitios',
    Icon: ZapOff,
    selectedClass: 'bg-amber-800 text-white',
  },
  {
    value: 'all',
    label: 'Todos',
    title: 'Todos los sitios',
    Icon: Users,
    selectedClass: 'bg-indigo-600 text-white',
  },
] as const;

const CONNECTION_LABELS: Record<ApPollConnectionStatus, string> = {
  connecting: 'Iniciando actualización',
  connected: 'Actualización automática',
  reconnecting: 'Recuperando actualización',
};

const CONNECTION_STYLES: Record<ApPollConnectionStatus, string> = {
  connecting: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
  connected: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  reconnecting: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
};

const CONNECTION_DOTS: Record<ApPollConnectionStatus, string> = {
  connecting: 'bg-sky-500 motion-safe:animate-pulse',
  connected: 'bg-emerald-500',
  reconnecting: 'bg-amber-500 motion-safe:animate-pulse',
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function MonitorHeader({
  nodeCount,
  apCount,
  cpeCount,
  nodeFilter,
  search,
  connectionStatus,
  lastPolledAt,
  canSync,
  syncing,
  onFilterChange,
  onSearchChange,
  onSync,
}: MonitorHeaderProps) {
  return (
    <section className="card overflow-hidden" aria-labelledby="ap-monitor-title">
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 id="ap-monitor-title" className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            <Activity className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span>Estado de antenas</span>
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Revisa el estado de las antenas y equipos conectados en cada sitio.
          </p>
        </div>

        <div
          role="status"
          aria-live="polite"
          className={`inline-flex min-h-8 w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${CONNECTION_STYLES[connectionStatus]}`}
        >
          <span className={`h-2 w-2 rounded-full ${CONNECTION_DOTS[connectionStatus]}`} aria-hidden="true" />
          {CONNECTION_LABELS[connectionStatus]}
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <p className="shrink-0 text-sm text-slate-600 dark:text-slate-400" aria-label={`${nodeCount} sitios, ${apCount} antenas, ${cpeCount} clientes conectados`}>
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{countLabel(nodeCount, 'sitio', 'sitios')}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{countLabel(apCount, 'antena', 'antenas')}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-semibold text-cyan-700 dark:text-cyan-300">{countLabel(cpeCount, 'cliente conectado', 'clientes conectados')}</span>
          </p>

          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center xl:justify-end">
            <div className="grid min-h-11 grid-cols-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" role="group" aria-label="Filtrar antenas por sitio">
              {FILTERS.map(({ value, label, title, Icon, selectedClass }, index) => {
                const selected = nodeFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFilterChange(value)}
                    aria-pressed={selected}
                    title={title}
                    className={`flex min-h-11 items-center justify-center gap-1.5 px-3 text-xs font-semibold transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ${index > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''} ${selected ? selectedClass : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-0 flex-1 md:w-56 md:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={event => onSearchChange(event.target.value)}
                placeholder="Buscar antena…"
                aria-label="Buscar antena por nombre, IP, modelo o red"
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Limpiar búsqueda"
                  title="Limpiar búsqueda"
                  className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onSync}
              disabled={!canSync}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 text-xs"
              title="Actualizar la información de las antenas visibles"
            >
              {syncing
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <RotateCw className="h-4 w-4" aria-hidden="true" />}
              <span>{syncing ? 'Actualizando…' : 'Actualizar información'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 sm:px-6">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> En línea</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> Requiere atención</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" /> Actualizando</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" /> Sin información</span>
        {lastPolledAt > 0 ? (
          <span className="flex items-center gap-1.5 sm:ml-auto">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Última actualización {fmtAgo(lastPolledAt)}
          </span>
        ) : null}
      </div>
    </section>
  );
}
