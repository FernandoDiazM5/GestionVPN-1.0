import { useState, useEffect } from 'react';
import {
  UserCog, UserPlus, Loader2, RefreshCw, X, Briefcase, Mail, KeyRound,
  Pencil, Trash2, Ban, Power, AlertTriangle,
} from 'lucide-react';
import { adminApi } from '../../../services/adminApi';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { isPlatformAdmin } from '../../../utils/permissions';
import type { Moderator } from '../../../types/account';

const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 text-slate-700 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500';
const iconBtn = 'p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export default function ModeratorsModule() {
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Moderator | null>(null);
  const [resetting, setResetting] = useState<Moderator | null>(null);
  const [deleting, setDeleting] = useState<Moderator | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session } = useWorkspaceSession();
  const canAdmin = isPlatformAdmin(session);

  const load = async () => {
    if (!canAdmin) { setLoading(false); return; }   // solo el Administrador consulta /api/admin
    setLoading(true);
    try { const r = await adminApi.listModerators(); setModerators(r.moderators); }
    catch { /* sesión/MySQL */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [canAdmin]);

  const toggleSuspend = async (m: Moderator) => {
    setBusyId(m.user_id); setError(null);
    try { await adminApi.updateModerator(m.user_id, { disabled: !m.disabled }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error al actualizar'); }
    finally { setBusyId(null); }
  };

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
          <button onClick={load} disabled={loading} className="btn-outline px-4 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50" title="Recargar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="card px-4 py-3 flex items-center gap-2 border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">{error}</p>
        </div>
      )}

      <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 select-none dark:border-slate-800 dark:bg-slate-800/50">
                <th className="th-cell dark:text-slate-400">Moderador</th>
                <th className="th-cell dark:text-slate-400">Workspace</th>
                <th className="th-cell dark:text-slate-400">Miembros</th>
                <th className="th-cell dark:text-slate-400">Alta</th>
                <th className="th-cell dark:text-slate-400 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {moderators.map(m => (
                <tr key={m.user_id} className={`transition-colors ${m.disabled ? 'opacity-60' : ''} hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                        <UserCog className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{m.name || m.email.split('@')[0]}</p>
                          {m.disabled && <span className="badge badge-warning">Suspendido</span>}
                        </div>
                        <p className="font-mono text-2xs text-slate-400 dark:text-slate-500 truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="text-slate-600 dark:text-slate-300">{m.workspace_name}</span></td>
                  <td className="px-4 py-3"><span className="badge badge-info">{m.miembros}</span></td>
                  <td className="px-4 py-3"><span className="text-slate-500 dark:text-slate-400">{new Date(m.created_at).toLocaleDateString('es')}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Editar nombre" onClick={() => setEditing(m)}
                        className={`${iconBtn} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button title="Resetear contraseña" onClick={() => setResetting(m)}
                        className={`${iconBtn} text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800`}>
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button title={m.disabled ? 'Activar' : 'Suspender'} onClick={() => toggleSuspend(m)} disabled={busyId === m.user_id}
                        className={`${iconBtn} ${m.disabled
                          ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                          : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'}`}>
                        {busyId === m.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : m.disabled ? <Power className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </button>
                      <button title="Eliminar" onClick={() => setDeleting(m)}
                        className={`${iconBtn} text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && moderators.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center">
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
      {editing && <EditModeratorModal mod={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {resetting && <ResetPasswordModal mod={resetting} onClose={() => setResetting(null)} onSaved={() => setResetting(null)} />}
      {deleting && <DeleteModeratorModal mod={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); load(); }} />}
    </div>
  );
}

// ── Cabecera reutilizable de modal ────────────────────────────────────────
function ModalShell({ icon, title, danger, busy, onClose, children }: {
  icon: React.ReactNode; title: string; danger?: boolean; busy?: boolean;
  onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
        <div className={`flex items-center justify-between rounded-t-2xl px-5 py-4 ${danger ? 'bg-rose-600' : 'bg-indigo-600'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">{icon}</div>
            <p className="text-sm font-bold text-white">{title}</p>
          </div>
          {!busy && <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>}
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}

// ── Crear ─────────────────────────────────────────────────────────────────
function CreateModeratorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.createModerator({ email: email.trim(), password, name: name.trim() || undefined, workspaceName: workspaceName.trim() || undefined });
      onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell icon={<UserPlus className="w-4 h-4 text-white" />} title="Nuevo Moderador" busy={busy} onClose={onClose}>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className={inputCls + ' pl-10'} type="email" placeholder="Correo del moderador" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <input className={inputCls} placeholder="Nombre (opcional)" value={name} onChange={e => setName(e.target.value)} />
      <div className="relative">
        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className={inputCls + ' pl-10'} placeholder="Nombre del workspace (opcional)" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
      </div>
      <div className="relative">
        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className={inputCls + ' pl-10'} type="password" placeholder="Contraseña (mín. 8)" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && email.trim() && password.length >= 8 && submit()} />
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
        <button onClick={submit} disabled={busy || !email.trim() || password.length < 8} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Crear
        </button>
      </div>
    </ModalShell>
  );
}

// ── Editar nombre / workspace ───────────────────────────────────────────────
function EditModeratorModal({ mod, onClose, onSaved }: { mod: Moderator; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(mod.name || '');
  const [workspaceName, setWorkspaceName] = useState(mod.workspace_name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.updateModerator(mod.user_id, { name: name.trim(), workspaceName: workspaceName.trim() || mod.workspace_name });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell icon={<Pencil className="w-4 h-4 text-white" />} title="Editar moderador" busy={busy} onClose={onClose}>
      <p className="font-mono text-2xs text-slate-400 dark:text-slate-500 -mt-1">{mod.email}</p>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Nombre</label>
      <input className={inputCls} placeholder="Nombre del moderador" value={name} onChange={e => setName(e.target.value)} />
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Workspace</label>
      <div className="relative">
        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className={inputCls + ' pl-10'} placeholder="Nombre del workspace" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
        <button onClick={submit} disabled={busy} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} Guardar
        </button>
      </div>
    </ModalShell>
  );
}

// ── Resetear contraseña ─────────────────────────────────────────────────────
function ResetPasswordModal({ mod, onClose, onSaved }: { mod: Moderator; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.updateModerator(mod.user_id, { password });
      setDone(true);
      setTimeout(onSaved, 1200);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); setBusy(false); }
  };

  return (
    <ModalShell icon={<KeyRound className="w-4 h-4 text-white" />} title="Resetear contraseña" busy={busy} onClose={onClose}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Nueva contraseña para <span className="font-semibold text-slate-700 dark:text-slate-200">{mod.name || mod.email}</span>.
      </p>
      <div className="relative">
        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className={inputCls + ' pl-10'} type="password" placeholder="Contraseña (mín. 8)" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && password.length >= 8 && submit()} autoFocus />
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {done
        ? <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✓ Contraseña actualizada</p>
        : (
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button onClick={submit} disabled={busy || password.length < 8} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Actualizar
            </button>
          </div>
        )}
    </ModalShell>
  );
}

// ── Eliminar (confirmación) ─────────────────────────────────────────────────
function DeleteModeratorModal({ mod, onClose, onDeleted }: { mod: Moderator; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true); setError(null);
    try { await adminApi.deleteModerator(mod.user_id); onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); setBusy(false); }
  };

  return (
    <ModalShell icon={<Trash2 className="w-4 h-4 text-white" />} title="Eliminar moderador" danger busy={busy} onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-rose-500" />
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Se dará de baja a <span className="font-semibold text-slate-800 dark:text-slate-100">{mod.name || mod.email}</span> y
          su workspace <span className="font-semibold">{mod.workspace_name}</span>
          {mod.miembros > 0 && <> (con {mod.miembros} miembro{mod.miembros !== 1 ? 's' : ''})</>}. Su acceso quedará bloqueado.
        </div>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
        <button onClick={confirm} disabled={busy} className="btn-danger px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar
        </button>
      </div>
    </ModalShell>
  );
}
