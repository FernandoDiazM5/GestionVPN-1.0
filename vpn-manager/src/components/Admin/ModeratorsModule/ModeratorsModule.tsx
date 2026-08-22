import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCog, UserPlus, Loader2, RefreshCw, X, Briefcase, Mail, KeyRound,
  Pencil, Trash2, Ban, Power, AlertTriangle, Link2, Copy, Check, Clock,
  Sparkles, Search, SlidersHorizontal, Users, CheckCircle2,
} from 'lucide-react';
import Dialog from '../../Common/Dialog';
import { adminApi } from '../../../services/adminApi';
import type { PendingInvitation } from '../../../services/adminApi';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { isPlatformAdmin } from '../../../utils/permissions';
import type { Moderator } from '../../../types/account';

/** Copia texto al portapapeles con fallback para navegadores sin clipboard API. */
async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fallback abajo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 text-slate-700 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500';
const iconBtn = 'p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

type StatusFilter = 'all' | 'active' | 'suspended';
type ModeratorSort = 'newest' | 'name' | 'members' | 'recent';

function formatLastAccess(value?: number | null) {
  if (!value) return 'Sin accesos';
  const elapsed = Date.now() - Number(value);
  if (elapsed < 60_000) return 'Hace instantes';
  if (elapsed < 3_600_000) return `Hace ${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 86_400_000) return `Hace ${Math.floor(elapsed / 3_600_000)} h`;
  return new Date(Number(value)).toLocaleDateString('es');
}

export default function ModeratorsModule() {
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [invites, setInvites] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Moderator | null>(null);
  const [resetting, setResetting] = useState<Moderator | null>(null);
  const [deleting, setDeleting] = useState<Moderator | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<ModeratorSort>('newest');
  const { session } = useWorkspaceSession();
  const canAdmin = isPlatformAdmin(session);

  const load = useCallback(async () => {
    if (!canAdmin) { setLoading(false); return; }   // solo el Administrador consulta /api/admin
    setLoading(true);
    setError(null);
    try {
      const [mods, invs] = await Promise.all([
        adminApi.listModerators(),
        adminApi.listInvitations(),
      ]);
      setModerators(mods.moderators);
      setInvites(invs.invitations);
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los moderadores.');
    }
    finally { setLoading(false); }
  }, [canAdmin]);
  useEffect(() => { load(); }, [load]);

  const toggleSuspend = async (m: Moderator) => {
    setBusyId(m.user_id); setError(null);
    try { await adminApi.updateModerator(m.user_id, { disabled: !m.disabled }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error al actualizar'); }
    finally { setBusyId(null); }
  };

  const toggleAiAccess = async (m: Moderator) => {
    if (m.disabled || aiBusyId) return;
    const enabled = !m.ai_access?.enabled;
    if (enabled && !window.confirm(
      `¿Habilitar Gemini AirOS para ${m.name || m.email}? Podrá consumir la cuota gratuita compartida después de aceptar el consentimiento.`
    )) return;
    setAiBusyId(m.user_id);
    setError(null);
    try {
      const result = await adminApi.setModeratorAiAccess(m.user_id, enabled);
      setModerators(current => current.map(item =>
        item.user_id === m.user_id ? { ...item, ai_access: result.access } : item
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el acceso a Gemini');
    } finally {
      setAiBusyId(null);
    }
  };

  const visibleModerators = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es');
    return moderators
      .filter(m => statusFilter === 'all' || (statusFilter === 'suspended' ? !!m.disabled : !m.disabled))
      .filter(m => !q || [m.name, m.email, m.workspace_name].some(value => value?.toLocaleLowerCase('es').includes(q)))
      .sort((a, b) => {
        if (sort === 'name') return (a.name || a.email).localeCompare(b.name || b.email, 'es');
        if (sort === 'members') return b.miembros - a.miembros;
        if (sort === 'recent') return Number(b.last_access_at || 0) - Number(a.last_access_at || 0);
        return Number(b.created_at) - Number(a.created_at);
      });
  }, [moderators, search, sort, statusFilter]);

  const activeCount = moderators.filter(m => !m.disabled).length;
  const suspendedCount = moderators.length - activeCount;
  const workspaceCount = new Set(moderators.map(m => m.workspace_id)).size;

  return (
    <div className="space-y-5 reveal-stagger">
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <UserCog className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span>Moderadores</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">Da de alta y gestiona los clientes que usan la plataforma</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button onClick={() => setShowCreate(true)} className="btn-primary flex min-h-11 flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm sm:flex-none">
            <UserPlus className="w-4 h-4" /> Nuevo Moderador
          </button>
          <button onClick={load} disabled={loading} className="btn-outline flex min-h-11 min-w-11 items-center justify-center px-3 py-2.5 text-sm disabled:opacity-50" title="Recargar" aria-label="Recargar moderadores">
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

      <section aria-label="Resumen de moderadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total', value: moderators.length, icon: UserCog, tone: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300' },
          { label: 'Activos', value: activeCount, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300' },
          { label: 'Suspendidos', value: suspendedCount, icon: Ban, tone: 'text-amber-600 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300' },
          { label: 'Workspaces', value: workspaceCount, icon: Briefcase, tone: 'text-sky-600 bg-sky-100 dark:bg-sky-500/20 dark:text-sky-300' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card flex min-w-0 items-center gap-3 p-3 sm:p-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0"><strong className="block text-xl leading-none text-slate-800 dark:text-slate-100">{value}</strong><span className="mt-1 block truncate text-2xs font-semibold uppercase tracking-wide text-slate-500">{label}</span></span>
          </div>
        ))}
      </section>

      <div className="card grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:p-4">
        <label className="relative min-w-0">
          <span className="sr-only">Buscar moderador</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} className={`${inputCls} min-h-11 pl-10`} placeholder="Buscar nombre, correo o workspace…" />
        </label>
        <label className="relative">
          <span className="sr-only">Filtrar por estado</span>
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className={`${inputCls} min-h-11 pl-9 pr-8`}>
            <option value="all">Todos los estados</option><option value="active">Activos</option><option value="suspended">Suspendidos</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Ordenar moderadores</span>
          <select value={sort} onChange={event => setSort(event.target.value as ModeratorSort)} className={`${inputCls} min-h-11 pr-8`}>
            <option value="newest">Más recientes</option><option value="name">Nombre</option><option value="members">Más miembros</option><option value="recent">Último acceso</option>
          </select>
        </label>
      </div>

      <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 select-none dark:border-slate-800 dark:bg-slate-800/50">
                <th className="th-cell dark:text-slate-400">Moderador</th>
                <th className="th-cell dark:text-slate-400">Workspace</th>
                <th className="th-cell dark:text-slate-400">Miembros</th>
                <th className="th-cell dark:text-slate-400">Gemini AirOS</th>
                <th className="th-cell dark:text-slate-400">Fecha de alta</th>
                <th className="th-cell dark:text-slate-400">Último acceso</th>
                <th className="th-cell dark:text-slate-400 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && moderators.length === 0 && [...Array(4)].map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
                      <div className="space-y-1.5">
                        <div className="skeleton h-3 w-28" />
                        <div className="skeleton h-2.5 w-40" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><div className="skeleton h-3 w-24" /></td>
                  <td className="px-4 py-3"><div className="skeleton h-5 w-8 rounded-full" /></td>
                  <td className="px-4 py-3"><div className="skeleton h-6 w-20 rounded-full" /></td>
                  <td className="px-4 py-3"><div className="skeleton h-3 w-20" /></td>
                  <td className="px-4 py-3"><div className="skeleton h-3 w-20" /></td>
                  <td className="px-4 py-3"><div className="skeleton h-7 w-28 ml-auto" /></td>
                </tr>
              ))}
              {visibleModerators.map(m => (
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
                        <p className="font-mono text-2xs text-slate-500 dark:text-slate-500 truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="text-slate-600 dark:text-slate-300">{m.workspace_name}</span></td>
                  <td className="px-4 py-3"><span className="badge badge-info">{m.miembros}</span></td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!m.ai_access?.enabled}
                      aria-label={`${m.ai_access?.enabled ? 'Deshabilitar' : 'Habilitar'} Gemini AirOS para ${m.name || m.email}`}
                      title={m.disabled ? 'Activa primero la cuenta del moderador' : 'Controla el acceso individual a los análisis AirOS con Gemini'}
                      disabled={m.disabled || aiBusyId !== null}
                      onClick={() => toggleAiAccess(m)}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-2xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                        m.ai_access?.enabled
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {aiBusyId === m.user_id
                        ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                        : <Sparkles className="h-4 w-4" />}
                      <span>{m.ai_access?.enabled ? 'Habilitado' : 'Deshabilitado'}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3"><span className="text-slate-500 dark:text-slate-400">{new Date(m.created_at).toLocaleDateString('es')}</span></td>
                  <td className="px-4 py-3"><span className="whitespace-nowrap text-slate-500 dark:text-slate-400">{formatLastAccess(m.last_access_at)}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Editar nombre" aria-label={`Editar ${m.name || m.email}`} onClick={() => setEditing(m)}
                        className={`${iconBtn} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button title="Resetear contraseña" aria-label={`Restablecer contraseña de ${m.name || m.email}`} onClick={() => setResetting(m)}
                        className={`${iconBtn} text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800`}>
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button title={m.disabled ? 'Activar' : 'Suspender'} aria-label={`${m.disabled ? 'Activar' : 'Suspender'} ${m.name || m.email}`} onClick={() => toggleSuspend(m)} disabled={busyId === m.user_id}
                        className={`${iconBtn} ${m.disabled
                          ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                          : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'}`}>
                        {busyId === m.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : m.disabled ? <Power className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </button>
                      <button title="Eliminar" aria-label={`Eliminar ${m.name || m.email}`} onClick={() => setDeleting(m)}
                        className={`${iconBtn} text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && visibleModerators.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                      <UserCog className="w-7 h-7 text-indigo-400 dark:text-indigo-400/70" />
                    </div>
                    <div>
                      <p className="text-slate-600 dark:text-slate-300 font-semibold">{moderators.length ? 'Sin resultados' : 'Aún no hay moderadores'}</p>
                      <p className="text-slate-500 dark:text-slate-500 text-xs mt-0.5">{moderators.length ? 'Prueba con otra búsqueda o filtro.' : 'Da de alta al primer cliente para que use la plataforma.'}</p>
                    </div>
                    {!moderators.length && <button onClick={() => setShowCreate(true)} className="btn-primary px-4 py-2 flex items-center gap-2 text-sm mt-1">
                      <UserPlus className="w-4 h-4" /> Nuevo Moderador
                    </button>}
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {visibleModerators.map(m => (
            <article key={m.user_id} className={`rounded-2xl border border-slate-200 p-4 dark:border-slate-700 ${m.disabled ? 'bg-slate-50 opacity-75 dark:bg-slate-900/40' : 'bg-white dark:bg-slate-900/20'}`}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"><UserCog className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-800 dark:text-slate-100">{m.name || m.email.split('@')[0]}</h3><span className={`badge ${m.disabled ? 'badge-warning' : 'badge-success'}`}>{m.disabled ? 'Suspendido' : 'Activo'}</span></div><p className="mt-1 break-all font-mono text-2xs text-slate-500">{m.email}</p></div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                <div><dt className="text-2xs font-semibold uppercase text-slate-500">Workspace</dt><dd className="mt-1 break-words font-semibold text-slate-700 dark:text-slate-200">{m.workspace_name}</dd></div>
                <div><dt className="text-2xs font-semibold uppercase text-slate-500">Miembros</dt><dd className="mt-1 font-semibold text-slate-700 dark:text-slate-200"><Users className="mr-1 inline h-3.5 w-3.5" />{m.miembros}</dd></div>
                <div><dt className="text-2xs font-semibold uppercase text-slate-500">Fecha de alta</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{new Date(m.created_at).toLocaleDateString('es')}</dd></div>
                <div><dt className="text-2xs font-semibold uppercase text-slate-500">Último acceso</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{formatLastAccess(m.last_access_at)}</dd></div>
              </dl>
              <button type="button" role="switch" aria-checked={!!m.ai_access?.enabled} disabled={m.disabled || aiBusyId !== null} onClick={() => toggleAiAccess(m)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">{aiBusyId === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Gemini AirOS: {m.ai_access?.enabled ? 'Habilitado' : 'Deshabilitado'}</button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setEditing(m)} className="btn-outline min-h-11 text-xs"><Pencil className="mr-1.5 inline h-4 w-4" />Editar</button>
                <button onClick={() => setResetting(m)} className="btn-outline min-h-11 text-xs"><KeyRound className="mr-1.5 inline h-4 w-4" />Contraseña</button>
                <button onClick={() => toggleSuspend(m)} disabled={busyId === m.user_id} className="btn-outline min-h-11 text-xs">{busyId === m.user_id ? <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> : m.disabled ? <Power className="mr-1.5 inline h-4 w-4" /> : <Ban className="mr-1.5 inline h-4 w-4" />}{m.disabled ? 'Activar' : 'Suspender'}</button>
                <button onClick={() => setDeleting(m)} className="btn-outline min-h-11 text-xs text-rose-600"><Trash2 className="mr-1.5 inline h-4 w-4" />Eliminar</button>
              </div>
            </article>
          ))}
          {!loading && visibleModerators.length === 0 && <div className="py-10 text-center text-sm text-slate-500">{moderators.length ? 'No hay resultados para estos filtros.' : 'Aún no hay moderadores.'}</div>}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 sm:px-6">
          Mostrando <span className="font-bold text-slate-700 dark:text-slate-200">{visibleModerators.length}</span> de {moderators.length} moderador{moderators.length !== 1 ? 'es' : ''}
        </div>
      </div>

      {invites.length > 0 && <PendingInvitationsCard invites={invites} />}

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
    <Dialog
      title={title}
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      panelClassName="modal-panel modal-panel-md"
    >
        <div className={`modal-header-decorated ${danger ? 'modal-header-rose' : 'modal-header-indigo'}`}>
          <div className="flex items-center gap-3">
            <div className="modal-header-icon">{icon}</div>
            <p className="text-sm font-bold text-white">{title}</p>
          </div>
          {!busy && <button onClick={onClose} className="modal-header-close"><X className="w-4 h-4" /></button>}
        </div>
        <div className="p-5 space-y-3">{children}</div>
    </Dialog>
  );
}

// ── Invitaciones pendientes por aceptar ───────────────────────────────────
//  Lista los moderadores invitados que aún NO aceptaron. Como el correo puede
//  no llegar (proveedor que bloquea SMTP saliente), cada fila permite copiar un
//  enlace de aceptación válido para compartirlo a mano (regenera el OTP).
function PendingInvitationsCard({ invites }: { invites: PendingInvitation[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const copyLink = async (id: string) => {
    setBusyId(id); setErr(null);
    try {
      const r = await adminApi.invitationLink(id);
      const ok = await copyToClipboard(r.acceptUrl);
      if (ok) { setCopiedId(id); setTimeout(() => setCopiedId(null), 2500); }
      else { window.prompt('Copia este enlace y compártelo con el moderador:', r.acceptUrl); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo generar el enlace'); }
    finally { setBusyId(null); }
  };

  const expired = (ms: number) => ms < Date.now();

  return (
    <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
        <Clock className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Invitaciones pendientes</h3>
        <span className="badge badge-warning text-2xs ml-1">{invites.length}</span>
        <p className="text-2xs text-slate-500 dark:text-slate-500 ml-auto hidden sm:block">
          ¿No llegó el correo? Copia el enlace y compártelo manualmente.
        </p>
      </div>
      {err && <p className="px-4 py-2 text-xs text-rose-600 dark:text-rose-400 font-medium sm:px-6">{err}</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{inv.name || inv.email.split('@')[0]}</p>
              <p className="data-muted text-2xs truncate">{inv.email}{inv.workspace_name ? ` · ${inv.workspace_name}` : ''}</p>
            </div>
            <span className={`badge text-2xs shrink-0 ${expired(inv.expires_at) ? 'badge-danger' : 'badge-neutral'}`}>
              {expired(inv.expires_at) ? 'expirada' : 'pendiente'}
            </span>
            <button
              onClick={() => copyLink(inv.id)}
              disabled={busyId === inv.id}
              className="btn-outline flex min-h-11 w-full shrink-0 items-center justify-center gap-2 px-3 py-2 text-xs disabled:opacity-40 sm:w-auto"
              title="Genera y copia un enlace de aceptación para compartirlo a mano"
            >
              {busyId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" />
                : copiedId === inv.id ? <Check className="w-4 h-4 text-emerald-500" />
                : <Link2 className="w-4 h-4" />}
              {copiedId === inv.id ? 'Copiado' : 'Copiar enlace'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Crear (Invitar) ───────────────────────────────────────────────────────
//  Mismo UX que invitar un miembro: solo email, le llega correo con link, el
//  invitado define su contraseña y genera su WG, y queda como OWNER de su ws.
function CreateModeratorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; acceptUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await adminApi.inviteModerator({
        email: email.trim(),
        name: name.trim() || undefined,
        workspaceName: workspaceName.trim() || undefined,
      });
      setSent({ email: r.email, acceptUrl: r.acceptUrl, emailSent: r.emailSent });
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  if (sent) {
    const copy = async () => {
      const ok = await copyToClipboard(sent.acceptUrl);
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
      else window.prompt('Copia este enlace y compártelo con el moderador:', sent.acceptUrl);
    };
    return (
      <ModalShell icon={<UserPlus className="w-4 h-4 text-white" />} title="Invitación creada" busy={false} onClose={onClose}>
        <div className="space-y-3">
          {sent.emailSent ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">✉ Correo enviado a <span className="font-mono">{sent.email}</span></p>
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">⚠ El correo no se pudo enviar.</p>
              <p className="text-2xs text-amber-700 dark:text-amber-400 mt-0.5">Comparte tú mismo el enlace de abajo con <span className="font-mono">{sent.email}</span>.</p>
            </div>
          )}
          <div>
            <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Enlace de aceptación (válido 24 h)</p>
            <div className="flex items-stretch gap-2">
              <input readOnly value={sent.acceptUrl} onFocus={e => e.currentTarget.select()}
                className={inputCls + ' font-mono text-2xs'} />
              <button onClick={copy} className="btn-primary px-3 flex items-center gap-2 text-xs shrink-0">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-2xs text-slate-500 dark:text-slate-500 mt-1">
              Al abrirlo, el moderador define su contraseña y genera su acceso WireGuard. Queda como OWNER de su workspace.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button onClick={() => { onCreated(); onClose(); }} className="btn-primary px-5 py-2.5 text-sm">Cerrar</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell icon={<UserPlus className="w-4 h-4 text-white" />} title="Nuevo Moderador" busy={busy} onClose={onClose}>
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
        Le enviaremos un correo con el código de invitación. El moderador definirá su contraseña
        y generará su configuración WireGuard al aceptar.
      </p>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
        <input className={inputCls + ' pl-10'} type="email" placeholder="Correo del moderador" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && email.trim() && submit()} />
      </div>
      <input className={inputCls} placeholder="Nombre (opcional)" value={name} onChange={e => setName(e.target.value)} />
      <div className="relative">
        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
        <input className={inputCls + ' pl-10'} placeholder="Nombre del workspace (opcional)" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onClose} className="btn-ghost btn-md">Cancelar</button>
        <button onClick={submit} disabled={busy || !email.trim()} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviar invitación
        </button>
      </div>
    </ModalShell>
  );
}

// ── Editar nombre ───────────────────────────────────────────────────────────
function EditModeratorModal({ mod, onClose, onSaved }: { mod: Moderator; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(mod.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.updateModerator(mod.user_id, { name: name.trim() });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell icon={<Pencil className="w-4 h-4 text-white" />} title="Editar moderador" busy={busy} onClose={onClose}>
      <p className="font-mono text-2xs text-slate-400 dark:text-slate-500 -mt-1">{mod.email}</p>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Nombre</label>
      <input className={inputCls} placeholder="Nombre del moderador" value={name} onChange={e => setName(e.target.value)} />
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Espacio de trabajo</label>
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        <Briefcase className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
        <span className="truncate font-medium">{mod.workspace_name}</span>
      </div>
      <p className="-mt-1 text-2xs text-slate-500 dark:text-slate-400">El nombre queda fijo al crear el espacio para conservar rutas y enlaces estables.</p>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onClose} className="btn-ghost btn-md">Cancelar</button>
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
        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
        <input className={inputCls + ' pl-10'} type="password" placeholder="Contraseña (mín. 8)" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && password.length >= 8 && submit()} autoFocus />
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
      {done
        ? <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✓ Contraseña actualizada</p>
        : (
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onClick={onClose} className="btn-ghost btn-md">Cancelar</button>
            <button onClick={submit} disabled={busy || password.length < 12} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
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
        <button onClick={onClose} className="btn-ghost btn-md">Cancelar</button>
        <button onClick={confirm} disabled={busy} className="btn-danger px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar
        </button>
      </div>
    </ModalShell>
  );
}
