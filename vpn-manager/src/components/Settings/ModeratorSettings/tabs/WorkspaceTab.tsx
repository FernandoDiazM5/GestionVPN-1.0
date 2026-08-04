import { Briefcase, LockKeyhole } from 'lucide-react';
import { useWorkspaceSession } from '../../../../context/WorkspaceSession';

export default function WorkspaceTab() {
  const { session } = useWorkspaceSession();

  return (
    <div className="card border border-slate-200 p-6 dark:border-slate-800">
      <div className="max-w-md space-y-4">
        <div>
          <h3 className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-100">Nombre del espacio de trabajo</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Se define al crear el espacio y se mantiene fijo para conservar rutas y enlaces estables.
          </p>
        </div>

        <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800/60">
          <Briefcase className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            {session?.workspace_name || 'Espacio de trabajo'}
          </span>
          <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" aria-label="Nombre fijo" />
        </div>
      </div>
    </div>
  );
}
