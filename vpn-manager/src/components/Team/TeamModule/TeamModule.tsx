import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Briefcase, Loader2, ShieldCheck, WifiOff, RefreshCw, Crown, User as UserIcon, UsersRound, Network } from 'lucide-react';
import Spinner from '../../Common/Spinner';
import { useWorkspaceSession } from '../../../context/WorkspaceSession';
import { useWorkspaceEvents } from '../../../hooks/useWorkspaceEvents';
import { teamApi } from '../../../services/teamApi';
import { auditApi } from '../../../services/auditApi';
import { ROLE_LABEL } from '../../../types/account';
import type { Member, Invitation, AuditLog, Role } from '../../../types/account';
import { canInvite, isModerator } from '../../../utils/permissions';
import MembersTable from './components/MembersTable';
import InvitePanel from './components/InvitePanel';
import AuditTimeline from './components/AuditTimeline';
import MemberProfile from './components/MemberProfile';
import MyInvitationsInbox from './components/MyInvitationsInbox';

// El módulo "Usuarios VPN" se carga en lazy porque su árbol pesa (hooks de
// WireGuard + tabla + modal de .conf) y la mayoría de visitas al Workspace
// abren la tab Usuarios por defecto.
const UserManagementPanel = lazy(
  () => import('../../Users/UserManagementPanel'),
);

type Tab = 'members' | 'vpn';

/**
 * Workspace — vista unificada de "Usuarios" (miembros del workspace) y
 * "Usuarios VPN" (peers WireGuard). Antes eran dos módulos del sidebar;
 * desde §34 se consolidan aquí con sub-tabs.
 *
 * • MEMBER  → solo "Usuarios" (sin switch — la tab "Usuarios VPN" es gestión
 *   de moderador). Mantiene MyInvitationsInbox + MemberProfile.
 * • OWNER (moderador) → ambas tabs.
 * • platform_admin → no entra aquí (no es miembro de un workspace).
 */
export default function TeamModule() {
  const { session, loading, refresh } = useWorkspaceSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('members');

  const moderator = isModerator(session?.role);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setDataError(null);
    setLogsError(null);
    try {
      const [membersResult, logsResult, invitationsResult] = await Promise.allSettled([
        teamApi.listMembers(),
        auditApi.listLogs(200),
        isModerator(session.role) ? teamApi.listInvitations() : Promise.resolve(null),
      ]);
      const failures: string[] = [];

      if (membersResult.status === 'fulfilled') {
        setMembers(membersResult.value.members);
      } else {
        failures.push('los miembros');
      }

      if (logsResult.status === 'fulfilled') {
        setLogs(logsResult.value.logs);
      } else {
        setLogsError('No se pudo actualizar la actividad reciente.');
      }

      if (invitationsResult.status === 'fulfilled') {
        if (invitationsResult.value) setInvitations(invitationsResult.value.invitations);
      } else {
        failures.push('las invitaciones');
      }

      if (failures.length > 0) {
        setDataError(`No se pudieron cargar ${failures.join(' ni ')} del workspace.`);
      }
    } catch {
      setDataError('No se pudieron cargar los datos del workspace.');
    }
    finally { setLoadingData(false); }
  }, [session]);

  useEffect(() => { loadData(); }, [loadData]);

  // Recarga ligera solo del timeline (para eventos en vivo)
  const reloadLogs = useCallback(async () => {
    if (!session) return;
    try {
      const l = await auditApi.listLogs(200);
      setLogs(l.logs);
      setLogsError(null);
    } catch {
      setLogsError('No se pudo actualizar la actividad reciente.');
    }
  }, [session]);

  // SSE: refresca el timeline cuando cualquier miembro ejecuta una acción
  useWorkspaceEvents(reloadLogs, !!session);

  const handleInvite = async (email: string, role: Exclude<Role, 'OWNER'>, tunnelId?: string, name?: string) => {
    const r = await teamApi.invite(email, role, tunnelId, name);
    await loadData();
    return r.dev ? 'dev' : null;
  };
  const onInvitationAccepted = () => { refresh(); loadData(); };
  const handleRevoke = async (id: string) => { await teamApi.revokeInvitation(id); await loadData(); };
  const handleRemove = async (m: Member) => {
    setBusyId(m.user_id);
    try { await teamApi.removeMember(m.user_id); await loadData(); }
    finally { setBusyId(null); }
  };
  const handleSetDisabled = async (userId: string, disabled: boolean) => {
    setBusyId(userId);
    try { await teamApi.setMemberDisabled(userId, disabled); await loadData(); }
    finally { setBusyId(null); }
  };

  // ── Estado de carga ──
  if (loading) {
    return (
      <Spinner block label="Cargando equipo…" />
    );
  }

  // ── Sin sesión: el puente automático falló (p. ej. MySQL apagado) ──
  if (!session) {
    return (
      <div className="card border-dashed border-2 border-slate-200 dark:border-slate-700 py-16 flex flex-col items-center text-center space-y-3">
        <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/15 rounded-2xl flex items-center justify-center">
          <WifiOff className="w-7 h-7 text-amber-500" />
        </div>
        <p className="text-slate-600 dark:text-slate-300 font-semibold">Workspace no disponible</p>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
          No se pudo conectar al servicio multi-usuario. Verifica que la base de datos (MySQL/XAMPP) esté activa.
        </p>
        <button onClick={refresh} className="btn-outline px-4 py-2 flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  // ── Header común: nombre del workspace + propietario + tú ──
  const owner = members.find(m => m.role === 'OWNER');
  const workspaceName = session.workspace_name || 'Mi workspace';
  const header = (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span className="truncate">{workspaceName}</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Workspace</p>
        </div>
      </div>

      {/* Personas del workspace — propietario + tú */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PersonRow
          icon={<Crown className="w-4 h-4 text-amber-500" />}
          tag="Propietario"
          name={owner?.name || (loadingData ? '—' : 'Sin propietario')}
          email={owner?.email}
        />
        <PersonRow
          icon={<UserIcon className="w-4 h-4 text-indigo-500" />}
          tag="Tú"
          name={session.name || session.email.split('@')[0]}
          email={session.email}
          badge={
            <span className="badge badge-info inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> {ROLE_LABEL[session.role]}
            </span>
          }
        />
      </div>
    </div>
  );

  // ── View (MEMBER): solo tab Usuarios (sin switch) ──
  if (session.role === 'MEMBER') {
    return (
      <div className="space-y-5 reveal-stagger">
        {header}
        <MyInvitationsInbox onAccepted={onInvitationAccepted} />
        <MemberProfile session={session} />
      </div>
    );
  }

  // ── Moderador (OWNER): header + tabs + cuerpo ──
  return (
    <div className="space-y-5 reveal-stagger">
      {/* Invitaciones dirigidas a este usuario (puede ser invitado a otro workspace) */}
      <MyInvitationsInbox onAccepted={onInvitationAccepted} />

      {header}

      {dataError && <InlineError message={dataError} onRetry={loadData} />}

      {/* Tabs */}
      <div className="card p-1 grid grid-cols-2 gap-1" role="tablist" aria-label="Vistas del workspace">
        <TabButton
          active={tab === 'members'}
          onClick={() => setTab('members')}
          icon={<UsersRound className="w-4 h-4" />}
          label="Usuarios"
          desc="Miembros del workspace"
        />
        <TabButton
          active={tab === 'vpn'}
          onClick={() => setTab('vpn')}
          icon={<Network className="w-4 h-4" />}
          label="Usuarios VPN"
          desc="Peers WireGuard"
        />
      </div>

      {loadingData && tab === 'members' && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" role="status">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando datos del workspace…
        </div>
      )}

      {/* Tab Usuarios — invitaciones + miembros + auditoría */}
      {tab === 'members' && (
        <>
          {canInvite(session.role) && (
            <InvitePanel
              invitations={invitations}
              onInvite={handleInvite}
              onRevoke={handleRevoke}
            />
          )}

          <MembersTable
            members={members}
            loading={loadingData}
            currentRole={session.role}
            currentUserId={session.id}
            busyId={busyId}
            onRemove={handleRemove}
            onSetDisabled={handleSetDisabled}
          />

          <AuditTimeline logs={logs} live />

          {logsError && <InlineError message={logsError} onRetry={reloadLogs} compact />}

          {!moderator && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Tienes una vista de solo lectura. Contacta a un moderador para gestionar el equipo.
            </p>
          )}
        </>
      )}

      {/* Tab Usuarios VPN — peers WireGuard (lazy) */}
      {tab === 'vpn' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
          </div>
        }>
          <UserManagementPanel embedded />
        </Suspense>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
//  Subcomponentes locales
// ────────────────────────────────────────────────────────────────────

interface PersonRowProps {
  icon: React.ReactNode;
  tag: string;
  name: string;
  email?: string;
  badge?: React.ReactNode;
}

function PersonRow({ icon, tag, name, email, badge }: PersonRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3">
      <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{tag}</p>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{name}</p>
        {email && <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">{email}</p>}
      </div>
      {badge}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
}

function TabButton({ active, onClick, icon, label, desc }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`min-w-0 min-h-11 px-2 sm:px-4 py-2.5 sm:py-3 rounded-xl flex items-center gap-2 sm:gap-3 transition-colors text-left
        ${active
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      <div className={`hidden min-[360px]:flex w-8 h-8 rounded-lg items-center justify-center shrink-0
        ${active ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-700/60'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        <p className={`hidden sm:block text-2xs truncate ${active ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>{desc}</p>
      </div>
    </button>
  );
}

function InlineError({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry: () => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 ${compact ? 'rounded-lg px-3 py-2 text-xs' : 'rounded-xl px-4 py-3 text-sm'}`}
    >
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="btn-ghost min-h-11 px-3 inline-flex items-center gap-2">
        <RefreshCw className="w-4 h-4" /> Reintentar
      </button>
    </div>
  );
}
