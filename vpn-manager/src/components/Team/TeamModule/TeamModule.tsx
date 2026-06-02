import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, ShieldCheck, WifiOff, RefreshCw } from 'lucide-react';
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

export default function TeamModule() {
  const { session, loading, refresh } = useWorkspaceSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const moderator = isModerator(session?.role);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    try {
      const [m, l] = await Promise.all([teamApi.listMembers(), auditApi.listLogs(50)]);
      setMembers(m.members);
      setLogs(l.logs);
      if (isModerator(session.role)) {
        const inv = await teamApi.listInvitations();
        setInvitations(inv.invitations);
      }
    } catch { /* la sesión expirará vía useSession */ }
    finally { setLoadingData(false); }
  }, [session]);

  useEffect(() => { loadData(); }, [loadData]);

  // Recarga ligera solo del timeline (para eventos en vivo)
  const reloadLogs = useCallback(async () => {
    if (!session) return;
    try { const l = await auditApi.listLogs(50); setLogs(l.logs); } catch { /* noop */ }
  }, [session]);

  // SSE: refresca el timeline cuando cualquier miembro ejecuta una acción
  useWorkspaceEvents(reloadLogs, !!session);

  const handleInvite = async (email: string, role: Exclude<Role, 'OWNER'>, tunnelId?: string) => {
    const r = await teamApi.invite(email, role, tunnelId);
    await loadData();
    return r.dev ? 'dev' : null;
  };
  const onInvitationAccepted = () => { refresh(); loadData(); };
  const handleRevoke = async (id: string) => { await teamApi.revokeInvitation(id); await loadData(); };
  const handleChangeRole = async (userId: string, role: Exclude<Role, 'OWNER'>) => {
    setBusyId(userId);
    try { await teamApi.changeRole(userId, role); await loadData(); }
    finally { setBusyId(null); }
  };
  const handleRemove = async (m: Member) => {
    setBusyId(m.user_id);
    try { await teamApi.removeMember(m.user_id); await loadData(); }
    finally { setBusyId(null); }
  };
  // ── Estado de carga ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ── Sin sesión: el puente automático falló (p. ej. MySQL apagado) ──
  if (!session) {
    return (
      <div className="card border-dashed border-2 border-slate-200 dark:border-slate-700 py-16 flex flex-col items-center text-center space-y-3">
        <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/15 rounded-2xl flex items-center justify-center">
          <WifiOff className="w-7 h-7 text-amber-500" />
        </div>
        <p className="text-slate-600 dark:text-slate-300 font-semibold">Gestión de equipo no disponible</p>
        <p className="text-slate-400 dark:text-slate-500 text-sm max-w-sm">
          No se pudo conectar al servicio multi-usuario. Verifica que la base de datos (MySQL/XAMPP) esté activa.
        </p>
        <button onClick={refresh} className="btn-outline px-4 py-2 flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  // ── View (MEMBER): bandeja de invitaciones + su propio perfil ──
  if (session.role === 'MEMBER') {
    return (
      <div className="space-y-5 reveal-stagger">
        <MyInvitationsInbox onAccepted={onInvitationAccepted} />
        <MemberProfile session={session} />
      </div>
    );
  }

  return (
    <div className="space-y-5 reveal-stagger">
      {/* Invitaciones dirigidas a este usuario (puede ser invitado a otro workspace) */}
      <MyInvitationsInbox onAccepted={onInvitationAccepted} />

      {/* Cabecera */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <span>Equipo</span>
        </h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs">{session.email}</span>
          <span className="badge badge-info inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> {ROLE_LABEL[session.role]}
          </span>
        </p>
      </div>

      {loadingData && (
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando datos del workspace…
        </div>
      )}

      {/* Invitaciones (solo moderadores) */}
      {canInvite(session.role) && (
        <InvitePanel
          currentRole={session.role}
          invitations={invitations}
          onInvite={handleInvite}
          onRevoke={handleRevoke}
        />
      )}

      {/* Miembros */}
      <MembersTable
        members={members}
        currentRole={session.role}
        currentUserId={session.id}
        busyId={busyId}
        onChangeRole={handleChangeRole}
        onRemove={handleRemove}
      />

      {/* Auditoría (tiempo real vía SSE) */}
      <AuditTimeline logs={logs} live />

      {!moderator && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          Tienes una vista de solo lectura. Contacta a un moderador para gestionar el equipo.
        </p>
      )}
    </div>
  );
}
