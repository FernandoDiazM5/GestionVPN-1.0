import { useState, useEffect } from 'react';
import { UserCog, UserPlus, Loader2, RefreshCw, X, Briefcase, Mail, KeyRound } from 'lucide-react';
import { adminApi } from '../../../services/adminApi';
import type { Moderator } from '../../../types/account';

export default function ModeratorsModule() {
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await adminApi.listModerators(); setModerators(r.moderators); }
    catch { /* sesión/MySQL */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <UserCog className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span>Moderadores</span>
          </h2>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Da de alta y gestiona los clientes que usan la plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-success px-4 py-2.5 flex items-center gap-2 text-sm">
            <UserPlus className="w-4 h-4" /> Nuevo Moderador
          </button>
          <button onClick={load} disabled={loading} className="btn-outline px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 select-none dark:border-slate-800 dark:bg-slate-800/50">
                <th className="th-cell dark:text-slate-400">Moderador</th>
                <th className="th-cell dark:text-slate-400">Workspace</th>
                <th className="th-cell dark:text-slate-400">Miembros</th>
                <th className="th-cell dark:text-slate-400">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {moderators.map(m => (
                <tr key={m.user_id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                        <UserCog className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{m.name || m.email.split('@')[0]}</p>
                        <p className="font-mono text-2xs text-slate-400 dark:text-slate-500 truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="text-slate-600 dark:text-slate-300">{m.workspace_name}</span></td>
                  <td className="px-4 py-3"><span className="badge badge-info">{m.miembros}</span></td>
                  <td className="px-4 py-3"><span className="text-slate-500 dark:text-slate-400">{new Date(m.created_at).toLocaleDateString('es')}</span></td>
                </tr>
              ))}
              {!loading && moderators.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <UserCog className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-slate-400 dark:text-slate-500 font-semibold">Aún no hay moderadores</p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs">Crea el primero con "Nuevo Moderador"</p>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-700 dark:text-slate-200">{moderators.length}</span> moderador{moderators.length !== 1 ? 'es' : ''}
        </div>
      </div>

      {showCreate && <CreateModeratorModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateModeratorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 text-slate-700 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500';

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.createModerator({ email: email.trim(), password, name: name.trim() || undefined, workspaceName: workspaceName.trim() || undefined });
      onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between bg-indigo-600 rounded-t-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center"><UserPlus className="w-4 h-4 text-white" /></div>
            <p className="text-sm font-bold text-white">Nuevo Moderador</p>
          </div>
          {!busy && <button onClick={onClose} className="p-1.5 text-indigo-300 hover:text-white hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>}
        </div>
        <div className="p-5 space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input className={cls + ' pl-10'} type="email" placeholder="Correo del moderador" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <input className={cls} placeholder="Nombre (opcional)" value={name} onChange={e => setName(e.target.value)} />
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input className={cls + ' pl-10'} placeholder="Nombre del workspace (opcional)" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
          </div>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input className={cls + ' pl-10'} type="password" placeholder="Contraseña (mín. 8)" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && email.trim() && password.length >= 8 && submit()} />
          </div>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button onClick={submit} disabled={busy || !email.trim() || password.length < 8}
              className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Crear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
