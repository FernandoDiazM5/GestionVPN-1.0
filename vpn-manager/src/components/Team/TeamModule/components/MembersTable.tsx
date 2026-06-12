import { useState } from 'react';
import { Crown, ShieldCheck, User, ChevronUp, ChevronDown, Trash2, Loader2, Shield, PowerOff, Power, Waypoints } from 'lucide-react';
import type { Member, Role } from '../../../../types/account';
import { ROLE_LABEL } from '../../../../types/account';
import { canManageRoles, canRemoveMembers, isOwner, isModerator } from '../../../../utils/permissions';
import MemberWireGuardModal from './MemberWireGuardModal';
import AssignTunnelsModal from './AssignTunnelsModal';

interface MembersTableProps {
  members: Member[];
  loading?: boolean;
  currentRole: Role;
  currentUserId: string;
  busyId: string | null;
  onChangeRole: (userId: string, role: Exclude<Role, 'OWNER'>) => void;
  onRemove: (member: Member) => void;
  /** Suspende/reactiva al miembro; el backend sincroniza el peer WG en MikroTik. */
  onSetDisabled: (userId: string, disabled: boolean) => void;
}

const ROLE_ICON: Record<Role, typeof Crown> = {
  OWNER: Crown,
  CO_MODERATOR: ShieldCheck,
  MEMBER: User,
};

function roleBadgeClass(role: Role) {
  if (role === 'OWNER') return 'badge badge-warning';
  if (role === 'CO_MODERATOR') return 'badge badge-info';
  return 'badge badge-neutral';
}

export default function MembersTable({
  members, loading = false, currentRole, currentUserId, busyId, onChangeRole, onRemove, onSetDisabled,
}: MembersTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmDisableId, setConfirmDisableId] = useState<string | null>(null);
  const [wgFor, setWgFor] = useState<Member | null>(null);
  const [assignFor, setAssignFor] = useState<Member | null>(null);
  const canManage = isModerator(currentRole);

  return (
    <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Miembros del workspace</h3>
        <p className="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">{members.length} miembro{members.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col />
            <col className="w-32" />
            <col className="w-56" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <th className="th-cell text-left dark:text-slate-400">Usuario</th>
              <th className="th-cell text-left dark:text-slate-400">Rol</th>
              <th className="th-cell text-right dark:text-slate-400">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && members.length === 0 && [...Array(3)].map((_, i) => (
              <tr key={`sk-${i}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
                    <div className="space-y-1.5"><div className="skeleton h-3 w-28" /><div className="skeleton h-2.5 w-40" /></div>
                  </div>
                </td>
                <td className="px-4 py-3"><div className="skeleton h-5 w-20 rounded-full" /></td>
                <td className="px-4 py-3"><div className="skeleton h-7 w-16 ml-auto" /></td>
              </tr>
            ))}
            {members.map(m => {
              const Icon = ROLE_ICON[m.role];
              const isSelf = m.user_id === currentUserId;
              const ownerRow = m.role === 'OWNER';
              const busy = busyId === m.user_id;
              return (
                <tr key={m.user_id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10 transition-colors group">
                  {/* Usuario */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {m.name || m.email.split('@')[0]}
                          {isSelf && <span className="ml-1.5 text-2xs font-medium text-slate-400">(tú)</span>}
                        </p>
                        <p className="font-mono text-2xs text-slate-400 dark:text-slate-500 truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  {/* Rol */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <span className={roleBadgeClass(m.role)}>{ROLE_LABEL[m.role]}</span>
                      {m.disabled && (
                        <span className="badge badge-danger" title="Acceso suspendido — peer WG deshabilitado en MikroTik">
                          Deshabilitado
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Acciones */}
                  <td className="px-4 py-3 align-middle text-right">
                    <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}

                      {/* Acceso WireGuard (moderador, sobre miembros no-OWNER) */}
                      {canManage && !ownerRow && !busy && (
                        <button onClick={() => setWgFor(m)}
                          title="Acceso WireGuard" aria-label="Acceso WireGuard"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors dark:hover:text-violet-400 dark:hover:bg-violet-500/10">
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Asignar túneles — solo MEMBER. CO_MOD/OWNER ya ven todos. */}
                      {canManage && m.role === 'MEMBER' && !busy && (
                        <button onClick={() => setAssignFor(m)}
                          title="Asignar túneles" aria-label="Asignar túneles"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10">
                          <Waypoints className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Habilitar / Deshabilitar (sincroniza peer WG en MikroTik) */}
                      {canManage && !ownerRow && !isSelf && !busy && (
                        m.disabled ? (
                          <button onClick={() => onSetDisabled(m.user_id, false)}
                            title="Habilitar miembro" aria-label="Habilitar miembro"
                            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors dark:text-emerald-400 dark:hover:bg-emerald-500/10">
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        ) : confirmDisableId === m.user_id ? (
                          <button onClick={() => { onSetDisabled(m.user_id, true); setConfirmDisableId(null); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-2xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                            <PowerOff className="w-3 h-3" /> Confirmar
                          </button>
                        ) : (
                          <button onClick={() => setConfirmDisableId(m.user_id)}
                            title="Deshabilitar miembro" aria-label="Deshabilitar miembro"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors dark:hover:text-amber-400 dark:hover:bg-amber-500/10">
                            <PowerOff className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}

                      {/* Promover / degradar (solo OWNER, no sobre sí mismo ni sobre el OWNER) */}
                      {canManageRoles(currentRole) && !ownerRow && !isSelf && !busy && (
                        m.role === 'MEMBER' ? (
                          <button onClick={() => onChangeRole(m.user_id, 'CO_MODERATOR')}
                            title="Promover a co-moderador" aria-label="Promover"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors dark:hover:text-sky-400 dark:hover:bg-sky-500/10">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => onChangeRole(m.user_id, 'MEMBER')}
                            title="Degradar a miembro" aria-label="Degradar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors dark:hover:text-slate-200 dark:hover:bg-slate-700">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}

                      {/* Remover (moderadores, no al OWNER ni a sí mismo) */}
                      {canRemoveMembers(currentRole) && !ownerRow && !isSelf && !busy && (
                        confirmId === m.user_id ? (
                          <button onClick={() => { onRemove(m); setConfirmId(null); }}
                            className="btn-danger flex items-center gap-1 px-2.5 py-1.5 text-2xs">
                            <Trash2 className="w-3 h-3" /> Confirmar
                          </button>
                        ) : (
                          <button onClick={() => setConfirmId(m.user_id)}
                            title="Remover miembro" aria-label="Remover miembro"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors dark:hover:text-rose-400 dark:hover:bg-rose-500/10">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}

                      {(ownerRow || isSelf) && !busy && (
                        <span className="text-2xs text-slate-300 dark:text-slate-600">{isOwner(m.role) ? 'Propietario' : '—'}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {wgFor && <MemberWireGuardModal member={wgFor} onClose={() => setWgFor(null)} />}
      {assignFor && <AssignTunnelsModal member={assignFor} onClose={() => setAssignFor(null)} />}
    </div>
  );
}
