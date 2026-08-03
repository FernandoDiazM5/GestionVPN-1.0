import {
  Activity,
  Clock,
  RotateCw,
} from 'lucide-react';
import { fmtAgo } from '../utils/formatters';
import type { ApPollConnectionStatus } from '../hooks/useApPollEvents';
import { Button, PageHeader, SearchInput, StatusBadge } from '../../../Common/ui';

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

const CONNECTION_LABELS: Record<ApPollConnectionStatus, string> = {
  connecting: 'Iniciando actualización',
  connected: 'Actualización en tiempo real',
  reconnecting: 'Recuperando actualización',
};

const CONNECTION_TONES: Record<ApPollConnectionStatus, 'info' | 'success' | 'warning'> = {
  connecting: 'info',
  connected: 'success',
  reconnecting: 'warning',
};

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
  const hasSites = nodeCount > 0;
  const hasEquipment = apCount > 0;

  return (
    <PageHeader
      title="Estado de equipos"
      description="Revisa el estado de los equipos de red conectados en cada sitio."
      icon={Activity}
      titleId="ap-monitor-title"
      aside={<StatusBadge role="status" aria-live="polite" tone={CONNECTION_TONES[connectionStatus]} dot pulse={connectionStatus !== 'connected'}>{CONNECTION_LABELS[connectionStatus]}</StatusBadge>}
    >
      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
        <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
          <div className="grid w-full grid-cols-3 gap-2 sm:w-fit" aria-label={`${nodeCount} sitios, ${apCount} equipos de red, ${cpeCount} clientes conectados`}>
            {[
              { value: nodeCount, label: nodeCount === 1 ? 'Sitio' : 'Sitios' },
              { value: apCount, label: apCount === 1 ? 'Equipo' : 'Equipos' },
              { value: cpeCount, label: cpeCount === 1 ? 'Cliente' : 'Clientes' },
            ].map(metric => (
              <div key={metric.label} className="min-w-20 rounded-xl bg-slate-50 px-3 py-2 text-center ring-1 ring-inset ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                <strong className="block text-lg font-bold leading-5 text-indigo-700 dark:text-indigo-300">{metric.value}</strong>
                <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</span>
              </div>
            ))}
          </div>

          <div className="grid min-w-0 gap-3 md:grid-cols-[12rem_minmax(14rem,18rem)_auto] md:items-center xl:justify-self-end">
            <label className="relative block min-w-0">
              <span className="sr-only">Filtrar equipos por sitio</span>
              <select
                value={nodeFilter}
                onChange={event => onFilterChange(event.target.value as NodeFilter)}
                aria-label="Filtrar equipos por sitio"
                className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm font-semibold text-slate-700 shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/30 focus:-translate-y-0.5 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:shadow-lg focus:shadow-indigo-500/30 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
              >
                <option value="active">Conectado</option>
                <option value="inactive">Otros sitios</option>
                <option value="all">Todos los sitios</option>
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
              </svg>
            </label>

            <SearchInput value={search} onChange={event => onSearchChange(event.target.value)} onClear={() => onSearchChange('')} disabled={!hasEquipment} placeholder="Buscar equipos…" aria-label="Buscar equipos por nombre, IP, modelo o red" />

            <Button
              onClick={onSync}
              disabled={!canSync}
              variant="primary"
              size="md"
              leadingIcon={RotateCw}
              loading={syncing}
              loadingLabel="Actualizando…"
              title="Actualizar la información de los equipos visibles"
            >
              Actualizar equipos
            </Button>
          </div>
        </div>
        {!hasSites && !hasEquipment ? <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400 xl:text-right">Selecciona “Otros sitios” o “Todos los sitios” para consultar equipos guardados.</p> : null}
      </div>

      {hasEquipment ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 sm:px-6">
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
      </div> : null}
    </PageHeader>
  );
}
