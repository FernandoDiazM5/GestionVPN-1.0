import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useSession } from '../../../hooks/useSession';
import { useWorkspaceEvents } from '../../../hooks/useWorkspaceEvents';
import { teamApi } from '../../../services/teamApi';
import { auditApi } from '../../../services/auditApi';
import { accountApi } from '../../../services/accountApi';
import { ROLE_LABEL } from '../../../types/account';
import type { Member, Invitation, AuditLog, Role } from '../../../types/account';
import { canInvite, isModerator } from '../../../utils/permissions';
import SessionGate from './components/SessionGate';
import MembersTable from './components/MembersTable';
import InvitePanel from './components/InvitePanel';
import AuditTimeline from './components/AuditTimeline';

export default function TeamModule() {
  const { session, loading, refresh } = useSession();

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

  const handleInvite = async (email: string, role: Exclude<Role, 'OWNER'>) => {
    const r = await teamApi.invite(email, role);
    await loadData();
    return r.dev ? 'dev' : null;
  };
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
  const handleLogout = async () => { try { await accountApi.logout(); } finally { refresh(); } };

  // ── Estados de carga / sin sesión ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }
  if (!session) return <SessionGate onAuthed={refresh} />;

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
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
        <button onClick={handleLogout} className="btn-outline px-4 py-2.5 flex items-center gap-2 text-sm shrink-0">
          <LogOut className="w-4 h-4" /> Cerrar sesión de equipo
        </button>
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
