import { Play, Square, Trash2, Loader2 } from 'lucide-react';
import type { VpnStatus } from '../types';

interface VpnCardActionsCellProps {
  status: VpnStatus;
  onActivate: () => void;
  onDeactivate: () => void;
  onRemove: () => void;
}

export default function VpnCardActionsCell({
  status,
  onActivate,
  onDeactivate,
  onRemove,
}: VpnCardActionsCellProps) {
  const isRunning = status === 'running';
  const isPending = status === 'activating' || status === 'deleting';

  return (
    <td className="px-4 py-3">
      <div className="flex items-center justify-end gap-2">
        <button
          disabled={status !== 'disabled'}
          onClick={onActivate}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
            ${status === 'disabled'
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/25 active:scale-[0.97]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
        >
          {status === 'activating'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Play className="w-3.5 h-3.5" />}
          <span>{status === 'activating' ? 'Activando' : 'Activar'}</span>
        </button>

        <button
          disabled={status !== 'running'}
          onClick={onDeactivate}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
            ${status === 'running'
              ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm shadow-rose-500/25 active:scale-[0.97]'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
        >
          {status === 'deleting'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Square className="w-3.5 h-3.5" />}
          <span>{status === 'deleting' ? 'Deteniendo' : 'Desactivar'}</span>
        </button>

        {!isRunning && !isPending && (
          <button
            onClick={onRemove}
            className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-rose-50 rounded-lg transition-colors dark:text-slate-600 dark:hover:bg-rose-500/10"
            title="Quitar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </td>
  );
}
