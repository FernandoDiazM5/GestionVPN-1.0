import { useState } from 'react';
import { Briefcase, Check, Loader2, AlertCircle } from 'lucide-react';
import { workspaceApi } from '../../../../services/workspaceApi';
import { useWorkspaceSession } from '../../../../context/WorkspaceSession';

export default function WorkspaceTab() {
  const { session, refresh } = useWorkspaceSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null); setOk(false);
    try {
      await workspaceApi.rename(name.trim());
      setOk(true); setName('');
      refresh();
      setTimeout(() => setOk(false), 4000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally { setBusy(false); }
  };

  return (
    <div className="card border border-slate-200 dark:border-slate-800 p-6">
      <form onSubmit={submit} className="space-y-4 max-w-md">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Nombre del workspace</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Es el nombre visible en correos de invitación y en el panel administrador.
          </p>
        </div>

        {ok && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Workspace actualizado</p>
          </div>
        )}
        {err && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700 dark:text-rose-300">{err}</p>
          </div>
        )}

        <div>
          <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
            Nuevo nombre
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={name} onChange={e => setName(e.target.value)}
              maxLength={160}
              placeholder="Ej: FIWIS Networks"
              className="input-field pl-10" />
          </div>
        </div>

        {session?.role !== 'OWNER' && (
          <p className="text-2xs text-amber-600 dark:text-amber-400">
            Solo el propietario del workspace puede renombrarlo.
          </p>
        )}

        <button type="submit" disabled={busy || !name.trim() || session?.role !== 'OWNER'}
          className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Guardar
        </button>
      </form>
    </div>
  );
}
