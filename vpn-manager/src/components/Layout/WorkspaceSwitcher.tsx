// ============================================================
//  WorkspaceSwitcher — selector del workspace activo (multi-membresía).
//
//  Un usuario puede ser OWNER de su workspace y MEMBER en otros (invitado).
//  Este bloque del Sidebar muestra el workspace activo y permite cambiarlo:
//  el backend re-emite la cookie (POST /account/switch-workspace) y se hace
//  reload completo (VpnContext no se re-monta con refresh()). También avisa
//  de invitaciones pendientes (bandeja in-app del módulo Workspace).
//  Solo se renderiza con ≥2 membresías o invitaciones pendientes.
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { Briefcase, Check, ChevronDown, Loader2, MailPlus } from 'lucide-react';
import type { WorkspaceMembership } from '@gestionvpn/contracts';
import { accountApi } from '../../services/accountApi';
import { teamApi } from '../../services/teamApi';
import { useWorkspaceSession } from '../../context/WorkspaceSession';
import { ROLE_LABEL } from '../../types/account';

interface WorkspaceSwitcherProps {
  mini: boolean;
  /** Navega al módulo Workspace (bandeja de invitaciones). */
  onGoToTeam: () => void;
}

export default function WorkspaceSwitcher({ mini, onGoToTeam }: WorkspaceSwitcherProps) {
  const { session } = useWorkspaceSession();
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [inviteCount, setInviteCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    accountApi.myWorkspaces()
      .then(r => setMemberships(r.workspaces))
      .catch(() => { /* sin servicio multi-usuario: no se muestra */ });
    teamApi.myInvitations()
      .then(r => setInviteCount(r.invitations.length))
      .catch(() => { /* best-effort */ });
  }, [session]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const switchTo = async (workspaceId: string) => {
    if (workspaceId === session?.workspace_id || switchingTo) return;
    setSwitchingTo(workspaceId); setError(null);
    try {
      await accountApi.switchWorkspace(workspaceId);
      // Remonta VpnProvider + WorkspaceSessionProvider desde cero;
      // purgeIfWorkspaceChanged limpia las cachés por workspace.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar de workspace');
      setSwitchingTo(null);
    }
  };

  const multi = memberships.length >= 2;
  if (!session || (!multi && inviteCount === 0)) return null;

  const current = memberships.find(m => m.workspace_id === session.workspace_id);
  const label = current?.workspace_name || session.workspace_name || 'Workspace';

  if (mini) {
    return (
      <div className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-center">
        <button
          onClick={() => (multi ? setOpen(v => !v) : onGoToTeam())}
          title={multi ? `Workspace: ${label}` : `${inviteCount} invitación(es) pendiente(s)`}
          aria-label="Cambiar de workspace"
          className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Briefcase className="w-4 h-4" />
          {inviteCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative px-3 py-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
      {multi && (
        <button
          onClick={() => setOpen(v => !v)}
          aria-label="Cambiar de workspace"
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-indigo-500/50 transition-colors text-left"
        >
          <Briefcase className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 leading-none">Workspace activo</p>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5">{label}</p>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {inviteCount > 0 && (
        <button
          onClick={onGoToTeam}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:hover:bg-indigo-500/20 transition-colors text-left"
        >
          <MailPlus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex-1">
            {inviteCount} invitación{inviteCount !== 1 ? 'es' : ''} pendiente{inviteCount !== 1 ? 's' : ''}
          </span>
        </button>
      )}

      {open && multi && (
        <div className="absolute left-3 right-3 top-full -mt-1 z-50 rounded-xl border border-slate-200 bg-white shadow-lg dark:bg-slate-900 dark:border-slate-700 py-1 max-h-64 overflow-y-auto">
          {memberships.map(m => {
            const active = m.workspace_id === session.workspace_id;
            const busy = switchingTo === m.workspace_id;
            return (
              <button
                key={m.workspace_id}
                onClick={() => switchTo(m.workspace_id)}
                disabled={active || !!switchingTo}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                  ${active ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{m.workspace_name}</p>
                  <p className="text-2xs text-slate-400 dark:text-slate-500">{ROLE_LABEL[m.role]}</p>
                </div>
                {busy
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 shrink-0" />
                  : active && <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-2xs text-rose-600 dark:text-rose-400 font-medium px-1">{error}</p>}
    </div>
  );
}
