import type { ReactNode } from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import ModuleSkeleton from './ModuleSkeleton';

interface Props {
  loading: boolean;
  error?: string | null;
  empty?: boolean;
  onRetry: () => void;
  children: ReactNode;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  skeletonRows?: number;
}

export default function AsyncQueryState({
  loading,
  error,
  empty = false,
  onRetry,
  children,
  loadingLabel = 'Cargando datos...',
  emptyTitle = 'Sin datos',
  emptyMessage,
  skeletonRows = 3,
}: Props) {
  if (loading) return <ModuleSkeleton rows={skeletonRows} withHeader={false} label={loadingLabel} />;

  if (error) {
    return (
      <div className="card border-rose-200 p-6 text-center dark:border-rose-500/30" role="alert">
        <AlertCircle className="mx-auto h-7 w-7 text-rose-500" />
        <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">No se pudieron cargar los datos</p>
        <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600 dark:text-slate-300">{error}</p>
        <button type="button" onClick={onRetry} className="btn-outline mt-4 inline-flex min-h-11 items-center gap-2 px-4 py-2">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="py-10 text-center text-slate-500 dark:text-slate-400">
        <Inbox className="mx-auto h-8 w-8" />
        <p className="mt-3 text-sm font-semibold">{emptyTitle}</p>
        {emptyMessage && <p className="mx-auto mt-1 max-w-md text-xs">{emptyMessage}</p>}
      </div>
    );
  }

  return children;
}

